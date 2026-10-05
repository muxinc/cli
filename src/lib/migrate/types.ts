import type { Asset, AssetCreateParams } from '@mux/ts/resources/video/assets';

export type ProviderId =
  | 'vimeo'
  | 'cloudflare-stream'
  | 'bunny'
  | 'wistia'
  | 'bucket'
  | 'manifest';

export type ItemState =
  | 'discovered'
  | 'preparing'
  | 'resolved'
  | 'creating'
  | 'processing'
  | 'enriching'
  | 'ready'
  | 'skipped'
  | 'errored';

export interface SourceItem {
  sourceId: string;
  type: 'video' | 'audio' | 'live_archive';
  exportable: boolean;
  skipReason?: string;
  title?: string;
  description?: string;
  tags?: string[];
  folder?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  createdAt?: string;
  sourceUrl?: string;
  embedPatterns: string[];
  posterUrl?: string;
  chapters?: Array<{ title: string; startSeconds: number }>;
  captionCount: number;
  /** BCP 47 languages of the source captions, when known before resolving. */
  captionLanguages?: string[];
  /** The fidelity `resolve` is expected to return, when known from the listing. */
  expectedFidelity?: 'original' | 'rendition';
  /** Customer-supplied passthrough, carried to the asset unchanged. */
  passthrough?: string;
  raw: unknown;
}

export interface ListPage {
  items: SourceItem[];
  next?: string;
  /** Library-wide conditions found while listing, reported by `plan`. */
  warnings?: MigrationError[];
}

export type CaptionSource =
  | {
      kind: 'url';
      url: string;
      language: string;
      label?: string;
      closedCaptions: boolean;
    }
  | {
      kind: 'text';
      text: string;
      format: 'srt' | 'vtt';
      language: string;
      label?: string;
      closedCaptions: boolean;
    };

export type TextCaption = Extract<CaptionSource, { kind: 'text' }>;

/**
 * Where caption text goes when a provider returns it inline instead of by URL.
 * See MIGRATE_SPEC.md "Captions".
 */
export interface CaptionHandler {
  /** Set when `captions.host_bucket` names a bucket the customer owns. */
  host?: {
    /** Uploads the caption and returns a URL Mux can fetch. */
    upload(key: string, caption: TextCaption): Promise<string>;
    remove(key: string): Promise<void>;
  };
  /** Saves the caption under the state directory and returns its path. */
  saveLocal(sourceId: string, caption: TextCaption): Promise<string>;
}

export type ResolveResult =
  | {
      kind: 'resolved';
      url: string;
      fidelity: 'original' | 'rendition';
      expiresAt?: Date;
      captions: CaptionSource[];
    }
  | { kind: 'pending'; retryAfterMs: number }
  | { kind: 'unavailable'; code: string; message: string };

export interface VerifyResult {
  ok: boolean;
  warnings: MigrationError[];
}

export interface CredentialSpec<Credentials> {
  variables: Array<{ name: string; required: boolean; description: string }>;
  /** Reads credentials from environment variables, or throws `{PROVIDER}_CREDENTIALS_MISSING`. */
  read(env: Record<string, string | undefined>): Credentials;
}

export interface SourceProvider<Credentials = void> {
  id: ProviderId;
  credentials: CredentialSpec<Credentials>;
  defaultConcurrency: number;
  verify(creds: Credentials): Promise<VerifyResult>;
  list(creds: Credentials, cursor?: string): Promise<ListPage>;
  resolve(creds: Credentials, item: SourceItem): Promise<ResolveResult>;
}

/** Every error the migration reports, in both human and JSON modes. */
export interface MigrationError {
  code: string;
  message: string;
  hint?: string;
  next_command?: string;
}

/**
 * The subset of the Mux API the migration uses. The production adapter wraps
 * the Mux SDK; tests supply an in-memory fake.
 */
export interface MuxMigrateClient {
  /** Never retried on timeouts or 5xx responses. See "Duplicate prevention". */
  createAsset(params: AssetCreateParams): Promise<Asset>;
  retrieveAsset(assetId: string): Promise<Asset>;
  /** All assets, newest first. Callers stop iterating when they have enough. */
  listAssets(): AsyncIterable<Asset>;
  retrieveDirective(directiveId: string): Promise<DirectiveSummary>;
  listDirectiveRuns(directiveId: string): AsyncIterable<DirectiveRunSummary>;
}

export interface DirectiveSummary {
  id: string;
  name: string;
  workflows: string[];
}

export type DirectiveRunStatus =
  | 'pending'
  | 'dispatching'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'partial'
  | 'errored';

export interface DirectiveRunSummary {
  runId: string;
  directiveId: string;
  assetId: string;
  status: DirectiveRunStatus;
}

/** A webhook event as delivered by the event stream. */
export interface MuxEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export type StreamMessage =
  | { kind: 'event'; event: MuxEvent }
  /** Emitted after the stream reconnects; events may have been missed. */
  | { kind: 'reconnected' };

export interface MigrationEventSource {
  /** Opens the stream. Resolves once connected, so no later event is missed. */
  open(signal: AbortSignal): Promise<AsyncIterable<StreamMessage>>;
}

export interface Clock {
  now(): number;
}

/** Newline-delimited JSON events printed by `run` in JSON mode. */
export type RunEvent =
  | {
      type: 'item';
      source_id: string;
      state: ItemState;
      asset_id: string | null;
      playback_id?: string;
      error?: MigrationError;
    }
  | ({ type: 'warning' } & MigrationError)
  | {
      type: 'summary';
      ready: number;
      errored: number;
      skipped: number;
      remaining: number;
      duplicates: number;
      next_command?: string;
    };
