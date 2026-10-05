import { ExitCode, type ExitCodeValue, resolveExitCode } from './exit-codes.ts';
import type { MigrationState } from './state.ts';
import type { ItemState, MigrationError } from './types.ts';

export interface StatusReport {
  migration_id: string | null;
  provider: string | null;
  counts: Record<ItemState, number>;
  /** Oldest first, at most ten. */
  in_flight: Array<{
    source_id: string;
    state: ItemState;
    asset_id: string | null;
    since: string;
  }>;
  errored: Array<{ source_id: string; error: MigrationError }>;
  exit_code: ExitCodeValue;
  next_command?: string;
}

const IN_FLIGHT_STATES: ItemState[] = [
  'preparing',
  'creating',
  'processing',
  'enriching',
];
const REMAINING_STATES: ItemState[] = [
  'discovered',
  'resolved',
  ...IN_FLIGHT_STATES,
];
const MAX_IN_FLIGHT = 10;

export function summarizeStatus(state: MigrationState): StatusReport {
  const counts = state.counts();
  const migration = state.migration();
  if (!migration) {
    return {
      migration_id: null,
      provider: null,
      counts,
      in_flight: [],
      errored: [],
      exit_code: ExitCode.Usage,
      next_command: 'mux migrate plan',
    };
  }

  const inFlight = state
    .list({ states: IN_FLIGHT_STATES })
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, MAX_IN_FLIGHT)
    .map((record) => ({
      source_id: record.sourceId,
      state: record.state,
      asset_id: record.assetId ?? null,
      since: new Date(record.updatedAt).toISOString(),
    }));
  const errored = state.list({ states: ['errored'] }).map((record) => ({
    source_id: record.sourceId,
    error: record.error ?? {
      code: 'UNKNOWN',
      message: 'No error was recorded.',
    },
  }));

  const remaining = REMAINING_STATES.reduce((sum, s) => sum + counts[s], 0);
  const exitCode = resolveExitCode({ remaining, errored: counts.errored });
  let nextCommand = 'mux migrate export';
  if (remaining > 0) nextCommand = 'mux migrate run --yes';
  else if (counts.errored > 0) nextCommand = 'mux migrate retry';

  return {
    migration_id: migration.id,
    provider: migration.provider,
    counts,
    in_flight: inFlight,
    errored,
    exit_code: exitCode,
    next_command: nextCommand,
  };
}
