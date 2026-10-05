import type { Asset } from '@mux/ts/resources/video/assets';
import type { DuplicateAsset } from './engine.ts';
import { ExitCode, type ExitCodeValue } from './exit-codes.ts';
import type { ItemRecord, MigrationState, VerifyCheck } from './state.ts';
import type { Clock, MuxMigrateClient } from './types.ts';

export interface VerifyDeps {
  state: MigrationState;
  mux: MuxMigrateClient;
  clock: Clock;
  fetch?: typeof fetch;
}

export interface VerifyItemResult {
  source_id: string;
  asset_id: string | null;
  checks: VerifyCheck[];
}

export interface VerifyReport {
  checked: number;
  passed: number;
  failed: VerifyItemResult[];
  duplicates: DuplicateAsset[];
  exit_code: ExitCodeValue;
  next_command?: string;
}

const DURATION_TOLERANCE_SECONDS = 1;

async function retrieve(
  mux: MuxMigrateClient,
  assetId: string,
): Promise<Asset | undefined> {
  try {
    return await mux.retrieveAsset(assetId);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return undefined;
    throw error;
  }
}

async function checkItem(
  deps: VerifyDeps,
  record: ItemRecord,
): Promise<{ checks: VerifyCheck[]; missing: boolean }> {
  const asset = record.assetId
    ? await retrieve(deps.mux, record.assetId)
    : undefined;
  if (!asset || asset.status !== 'ready') {
    return {
      missing: !asset,
      checks: [
        {
          name: 'asset_ready',
          ok: false,
          message: asset
            ? `Asset ${asset.id} is ${asset.status}.`
            : `Asset ${record.assetId ?? '(none)'} no longer exists.`,
        },
      ],
    };
  }

  const checks: VerifyCheck[] = [{ name: 'asset_ready', ok: true }];

  const sourceDuration = record.item.durationSeconds;
  if (sourceDuration !== undefined && asset.duration !== undefined) {
    const difference = Math.abs(asset.duration - sourceDuration);
    checks.push({
      name: 'duration',
      ok: difference <= DURATION_TOLERANCE_SECONDS,
      ...(difference > DURATION_TOLERANCE_SECONDS && {
        message: `Asset is ${asset.duration}s; the source is ${sourceDuration}s.`,
      }),
    });
  }

  const expectedTracks =
    record.item.captionCount - record.pendingCaptions.length;
  if (expectedTracks > 0) {
    const textTracks = (asset.tracks ?? []).filter(
      (track) => track.type === 'text' && track.status === 'ready',
    ).length;
    checks.push({
      name: 'text_tracks',
      ok: textTracks >= expectedTracks,
      ...(textTracks < expectedTracks && {
        message: `${textTracks} of ${expectedTracks} caption track(s) are ready.`,
      }),
    });
  }

  const publicId = record.playbackIds.find((p) => p.policy === 'public')?.id;
  if (publicId) {
    const url = `https://stream.mux.com/${publicId}.m3u8`;
    const response = await (deps.fetch ?? fetch)(url).catch(() => undefined);
    checks.push({
      name: 'playback',
      ok: Boolean(response?.ok),
      ...(!response?.ok && {
        message: `${url} responded ${response ? response.status : 'with a network error'}.`,
      }),
    });
  }

  const incomplete = record.directiveRuns.filter(
    (run) => run.status !== 'completed',
  );
  if (record.directiveRuns.length > 0) {
    checks.push({
      name: 'directive_runs',
      ok: incomplete.length === 0,
      ...(incomplete.length > 0 && {
        message: incomplete
          .map(
            (run) =>
              `Directive ${run.directiveId} run ${run.runId || '(not started)'} is ${run.status}.`,
          )
          .join(' '),
      }),
    });
  }

  return { checks, missing: false };
}

/**
 * Lists every asset whose external ID belongs to a migrated item but which is
 * not the asset the migration recorded for it.
 */
async function findDuplicates(
  deps: VerifyDeps,
  records: ItemRecord[],
  prefix: string,
): Promise<DuplicateAsset[]> {
  const bySource = new Map(records.map((record) => [record.sourceId, record]));
  const duplicates: DuplicateAsset[] = [];
  for await (const asset of deps.mux.listAssets()) {
    const externalId = asset.meta?.external_id;
    if (!externalId?.startsWith(prefix)) continue;
    const record = bySource.get(externalId.slice(prefix.length));
    if (record?.assetId && record.assetId !== asset.id) {
      duplicates.push({
        sourceId: record.sourceId,
        keptAssetId: record.assetId,
        duplicateAssetId: asset.id,
      });
    }
  }
  return duplicates;
}

/** Checks every ready item against its source and records the results. */
export async function verifyMigration(
  deps: VerifyDeps,
  options: { ids?: string[] } = {},
): Promise<VerifyReport> {
  const { state } = deps;
  const migration = state.migration();
  const records = state
    .list({ states: ['ready'] })
    .filter((record) => !options.ids || options.ids.includes(record.sourceId));

  const failed: VerifyItemResult[] = [];
  let reset = 0;
  for (const record of records) {
    const { checks, missing } = await checkItem(deps, record);
    const passed = checks.every((check) => check.ok);
    state.update(record.sourceId, {
      verification: { verifiedAt: deps.clock.now(), passed, checks },
    });
    if (missing) {
      state.update(record.sourceId, {
        state: 'errored',
        error: {
          code: 'VERIFY_ASSET_MISSING',
          message: `Asset ${record.assetId} no longer exists in Mux.`,
          next_command: 'mux migrate retry',
        },
      });
      reset++;
    }
    if (!passed) {
      failed.push({
        source_id: record.sourceId,
        asset_id: record.assetId ?? null,
        checks: checks.filter((check) => !check.ok),
      });
    }
  }

  const duplicates = migration
    ? await findDuplicates(deps, state.list(), `${migration.provider}:`)
    : [];
  const ok = failed.length === 0 && duplicates.length === 0;
  return {
    checked: records.length,
    passed: records.length - failed.length,
    failed,
    duplicates,
    exit_code: ok ? ExitCode.Success : ExitCode.Failed,
    ...(reset > 0
      ? { next_command: 'mux migrate retry' }
      : ok && { next_command: 'mux migrate export' }),
  };
}
