import { CREATE_LIMIT } from './client.ts';
import { resolveExitCode } from './exit-codes.ts';
import { MigrationRun } from './run/migration-run.ts';
import { continueCommand, tallyScope } from './run/shared.ts';
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

  const run = new MigrationRun(deps, options);
  return run.execute(plan);
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
