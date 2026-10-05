import type { AssetCreateParams } from '@mux/ts/resources/video/assets';
import type { ExitCodeValue } from '../exit-codes.ts';
import type { MigrationState } from '../state.ts';
import type {
  CaptionHandler,
  Clock,
  MigrationError,
  MigrationEventSource,
  MuxMigrateClient,
  RunEvent,
  SourceItem,
  SourceProvider,
} from '../types.ts';

export interface MigrationDeps<Credentials = void> {
  state: MigrationState;
  provider: SourceProvider<Credentials>;
  credentials: Credentials;
  mux: MuxMigrateClient;
  events: MigrationEventSource;
  clock: Clock;
  captions?: CaptionHandler;
  /** Called after each state change has been written to the state file. */
  emit?: (event: RunEvent) => void;
}

export interface PlanSummary {
  total: number;
  added: number;
  exportable: number;
  skipped: number;
  by_type: Partial<Record<SourceItem['type'], number>>;
  skip_reasons: Record<string, number>;
  /** Sum of known source durations; null when the provider reports none. */
  duration_seconds: number | null;
  size_bytes: number | null;
  fidelity: { original: number; rendition: number; unknown: number };
  /** Source caption tracks by language. */
  captions: Record<string, number>;
  warnings: MigrationError[];
  pricing_url: string;
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
  /** Playback and quality settings from the recipe and flags. */
  asset?: Omit<
    AssetCreateParams,
    'inputs' | 'meta' | 'passthrough' | 'directives'
  >;
  recipeHash?: string;
  /** Overrides for the run's timeouts and polling intervals. */
  timing?: Partial<RunTiming>;
}

export interface RunTiming {
  /** A safety reconcile in case the stream silently stops delivering events. */
  reconcileIntervalMs: number;
  /** How long to keep retrying sources that are being prepared before leaving them for the next run. */
  preparationTimeoutMs: number;
  captionCleanupPollMs: number;
  /** How long to wait for caption tracks to finish before leaving the uploads for the next run. */
  captionCleanupTimeoutMs: number;
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
