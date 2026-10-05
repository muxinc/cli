import type { ExitCodeValue } from './exit-codes.ts';
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

export function summarizeStatus(_state: MigrationState): StatusReport {
  throw new Error('Not implemented');
}
