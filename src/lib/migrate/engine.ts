import type { AssetCreateParams } from '@mux/ts/resources/video/assets';
import type { ExitCodeValue } from './exit-codes.ts';
import type { MigrationState } from './state.ts';
import type {
  Clock,
  MigrationError,
  MigrationEventSource,
  MuxMigrateClient,
  RunEvent,
  SourceProvider,
} from './types.ts';

export interface MigrationDeps<Credentials = void> {
  state: MigrationState;
  provider: SourceProvider<Credentials>;
  credentials: Credentials;
  mux: MuxMigrateClient;
  events: MigrationEventSource;
  clock: Clock;
  /** Called after each state change has been written to the state file. */
  emit?: (event: RunEvent) => void;
}

export interface PlanSummary {
  total: number;
  added: number;
  exportable: number;
  skipped: number;
}

export interface RunOptions {
  /** `--yes`. Without it nothing is created and the exit code is 3. */
  confirmed: boolean;
  limit?: number;
  ids?: string[];
  timeBudgetMs?: number;
  concurrency?: number;
  /** False with `--no-wait`. Defaults to true. */
  wait?: boolean;
  directives?: string[];
  skipRobots?: boolean;
  /** Playback and quality settings from the recipe and flags. */
  asset?: Omit<
    AssetCreateParams,
    'inputs' | 'meta' | 'passthrough' | 'directives'
  >;
  recipeHash?: string;
}

export interface DuplicateAsset {
  sourceId: string;
  keptAssetId: string;
  duplicateAssetId: string;
}

export interface RunResult {
  exitCode: ExitCodeValue;
  ready: number;
  errored: number;
  skipped: number;
  remaining: number;
  duplicates: DuplicateAsset[];
  nextCommand?: string;
  /** Set when the run stopped before creating anything. */
  error?: MigrationError;
  plan?: PlanSummary;
}

/** Inventories the source into the state file. Free and idempotent. */
export async function planMigration<C>(
  _deps: MigrationDeps<C>,
): Promise<PlanSummary> {
  throw new Error('Not implemented');
}

export async function runMigration<C>(
  _deps: MigrationDeps<C>,
  _options: RunOptions,
): Promise<RunResult> {
  throw new Error('Not implemented');
}

/** Re-queues errored items. Returns the number re-queued. */
export function retryErrored(_state: MigrationState, _ids?: string[]): number {
  throw new Error('Not implemented');
}
