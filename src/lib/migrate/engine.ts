import { CREATE_LIMIT } from './client.ts';
import { resolveExitCode } from './exit-codes.ts';
import { ExternalIds } from './external-id.ts';
import { MigrationRun } from './run/migration-run.ts';
import {
  ADOPTION_WINDOW_MS,
  continueCommand,
  isAuthFailure,
  messageOf,
  tallyScope,
} from './run/shared.ts';
import type {
  MigrationDeps,
  PlanSummary,
  RunOptions,
  RunResult,
} from './run/types.ts';
import type { MigrationState } from './state.ts';
import type { ItemState, MigrationError } from './types.ts';

export { attachCaptionCommand, continueCommand } from './run/shared.ts';
export type {
  DuplicateAsset,
  MigrationDeps,
  PlanSummary,
  RunOptions,
  RunResult,
  RunTiming,
} from './run/types.ts';

export const PRICING_URL = 'https://www.mux.com/pricing';

const TO_CREATE = new Set<ItemState>(['discovered', 'preparing', 'resolved']);

/** Inventories the source into the state file. Free and idempotent. */
export async function planMigration<C>(
  deps: MigrationDeps<C>,
): Promise<PlanSummary> {
  const { state, provider, credentials } = deps;
  state.initMigration(provider.id);
  let added = 0;
  const warnings: MigrationError[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.list(credentials, cursor);
    added += state.upsertDiscovered(page.items).added;
    warnings.push(...(page.warnings ?? []));
    cursor = page.next;
  } while (cursor);

  let existing: PlanSummary['existing_assets'] = {
    checked: 0,
    matching: 0,
    examples: [],
  };
  try {
    existing = await findEarlierAssets(deps);
  } catch (error) {
    // The check is advisory, so a transient failure does not stop planning.
    if (isAuthFailure(error)) throw error;
    warnings.push({
      code: 'PREVIOUS_MIGRATION_CHECK_FAILED',
      message: `Could not check for an earlier migration of this library: ${messageOf(error)}`,
      hint: 'Run mux migrate plan again to repeat the check.',
    });
  }
  if (existing.matching > 0) {
    warnings.push({
      code: 'PREVIOUS_MIGRATION_FOUND',
      message: `${existing.matching} of the ${existing.checked} most recent assets created before this migration already carry external IDs for videos in this library. Running this migration creates another asset for each of those videos.`,
      hint: 'If an earlier run used a different state file, resume it with --state or from its folder. Otherwise confirm with the user that new assets are intended.',
    });
  }

  const records = state.list();
  const exportable = records.filter((record) => record.state !== 'skipped');
  const tally = (values: Array<string | undefined>) => {
    const counts: Record<string, number> = {};
    for (const value of values) {
      if (value !== undefined) counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  };
  const sum = (values: Array<number | undefined>) => {
    const known = values.filter((v): v is number => v !== undefined);
    return known.length ? known.reduce((total, v) => total + v, 0) : null;
  };
  const items = exportable.map((record) => record.item);

  return {
    total: records.length,
    added,
    exportable: exportable.length,
    skipped: records.length - exportable.length,
    by_type: tally(records.map((record) => record.item.type)),
    skip_reasons: tally(
      records
        .filter((record) => record.state === 'skipped')
        .map((record) => record.item.skipReason ?? 'Not exportable'),
    ),
    duration_seconds: sum(items.map((item) => item.durationSeconds)),
    size_bytes: sum(items.map((item) => item.sizeBytes)),
    fidelity: {
      original: items.filter((item) => item.expectedFidelity === 'original')
        .length,
      rendition: items.filter((item) => item.expectedFidelity === 'rendition')
        .length,
      unknown: items.filter((item) => item.expectedFidelity === undefined)
        .length,
    },
    captions: tally(items.flatMap((item) => item.captionLanguages ?? [])),
    warnings,
    create_seconds: Math.ceil(
      records.filter((record) => TO_CREATE.has(record.state)).length /
        CREATE_LIMIT.perSecond,
    ),
    existing_assets: existing,
    pricing_url: PRICING_URL,
  };
}

/** Re-queues errored items. Returns the number re-queued. */
export function retryErrored(state: MigrationState, ids?: string[]): number {
  const errored = state
    .list({ states: ['errored'] })
    .filter((record) => !ids || ids.includes(record.sourceId));
  for (const record of errored) {
    // The previous asset failed, so the retry starts a fresh attempt. Uploaded
    // captions stay recorded until they are cleaned up.
    state.update(record.sourceId, {
      state: 'discovered',
      error: undefined,
      assetId: undefined,
      playbackIds: [],
      createStartedAt: undefined,
      pendingCaptions: [],
    });
  }
  return errored.length;
}

export async function runMigration<C>(
  deps: MigrationDeps<C>,
  options: RunOptions,
): Promise<RunResult> {
  const verified = await deps.provider.verify(deps.credentials);
  if (!verified.ok) {
    return stoppedResult(
      deps,
      options,
      { usageError: true },
      verified.warnings[0],
    );
  }

  const lock = deps.state.acquireRunLock();
  if (!lock) {
    return stoppedResult(
      deps,
      options,
      { usageError: true },
      {
        code: 'RUN_IN_PROGRESS',
        message: 'Another mux migrate run is using this state file.',
        hint: 'Wait for it to finish, or use --state for a separate migration. Two runs on one state file could create the same videos twice.',
      },
    );
  }
  try {
    const plan = await planMigration(deps);
    if (!options.confirmed) {
      return stoppedResult(
        deps,
        options,
        { confirmationRequired: true },
        undefined,
        plan,
      );
    }
    for (const warning of plan.warnings) {
      deps.emit?.({ type: 'warning', ...warning });
    }
    const run = new MigrationRun(deps, options);
    return await run.execute(plan);
  } finally {
    lock.release();
  }
}

/** How many of the most recent earlier assets the earlier-migration check reads. */
const EARLIER_ASSETS_CHECKED = 1000;
const EARLIER_ASSET_EXAMPLES = 5;

/**
 * Looks for assets created before this migration started that carry its
 * provider's external IDs for items in this library. The asset list has no
 * filters, so only the most recent assets are read.
 */
async function findEarlierAssets<C>(
  deps: MigrationDeps<C>,
): Promise<PlanSummary['existing_assets']> {
  const { state, provider, mux } = deps;
  const migration = state.migration();
  const result: PlanSummary['existing_assets'] = {
    checked: 0,
    matching: 0,
    examples: [],
  };
  if (!migration) return result;
  const startedBefore = migration.createdAt - ADOPTION_WINDOW_MS;
  const externalIds = new ExternalIds(provider.id, state.sourceIds());
  for await (const asset of mux.listAssets()) {
    if (Number(asset.created_at) * 1000 >= startedBefore) continue;
    result.checked++;
    const sourceId = externalIds.sourceIdFor(asset.meta?.external_id);
    if (sourceId !== undefined && state.get(sourceId)) {
      result.matching++;
      if (result.examples.length < EARLIER_ASSET_EXAMPLES) {
        result.examples.push({ source_id: sourceId, asset_id: asset.id });
      }
    }
    if (result.checked >= EARLIER_ASSETS_CHECKED) break;
  }
  return result;
}

function stoppedResult<C>(
  deps: MigrationDeps<C>,
  options: RunOptions,
  outcome: { usageError?: boolean; confirmationRequired?: boolean },
  error?: MigrationError,
  plan?: PlanSummary,
): RunResult {
  const tally = tallyScope(deps.state, options.ids);
  const exitCode = resolveExitCode({ ...outcome, ...tally });
  const nextCommand = outcome.confirmationRequired
    ? continueCommand(options)
    : error?.next_command;
  return {
    exitCode,
    ...tally,
    duplicates: [],
    nextCommand,
    error,
    plan,
  };
}
