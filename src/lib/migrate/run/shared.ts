import type { AssetCreateParams } from '@mux/ts/resources/video/assets';
import type { MigrationState, PendingCaption } from '../state.ts';
import type { CaptionSource, ItemState } from '../types.ts';
import type { RunOptions, RunTiming } from './types.ts';

export const DEFAULT_TIMING: RunTiming = {
  reconcileIntervalMs: 60_000,
  preparationTimeoutMs: 30 * 60_000,
  captionCleanupPollMs: 5_000,
  captionCleanupTimeoutMs: 10 * 60_000,
};

/** Mux's limit for an asset's `passthrough`. */
export const MAX_PASSTHROUGH_LENGTH = 255;

/**
 * How far before an item's create request an asset may have been created and
 * still belong to it. Covers clock skew between this machine and Mux.
 */
export const ADOPTION_WINDOW_MS = 5 * 60_000;

export const PENDING_STATES: ItemState[] = [
  'discovered',
  'preparing',
  'resolved',
  'creating',
  'processing',
];

export function tallyScope(state: MigrationState, ids?: string[]) {
  const counts = state.counts(ids);
  return {
    ready: counts.ready,
    errored: counts.errored,
    skipped: counts.skipped,
    remaining: PENDING_STATES.reduce((sum, s) => sum + counts[s], 0),
  };
}

function formatDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

/**
 * The command that continues this migration. It repeats the run's own
 * batching flags and never includes --no-wait, so running it always makes
 * progress.
 */
export function continueCommand(options: RunOptions): string {
  const parts = ['mux migrate run --yes'];
  if (options.ids?.length) parts.push(`--ids ${options.ids.join(',')}`);
  if (options.limit !== undefined) parts.push(`--limit ${options.limit}`);
  if (options.timeBudgetMs !== undefined) {
    parts.push(`--time-budget ${formatDuration(options.timeBudgetMs)}`);
  }
  return parts.join(' ');
}

export function captionInput(
  url: string,
  caption: CaptionSource,
): NonNullable<AssetCreateParams['inputs']>[number] {
  return {
    url,
    type: 'text',
    text_type: 'subtitles',
    language_code: caption.language,
    name: caption.label,
    closed_captions: caption.closedCaptions,
  };
}

/** The `mux assets tracks create` command that attaches a saved caption once it is hosted. */
export function attachCaptionCommand(
  assetId: string,
  caption: PendingCaption,
): string {
  const file = caption.path.split('/').pop();
  return [
    `mux assets tracks create ${assetId}`,
    `--url <URL of ${file}>`,
    '--type text --text-type subtitles',
    `--language-code ${caption.language}`,
    ...(caption.closedCaptions ? ['--closed-captions'] : []),
  ].join(' ');
}

export function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isAuthFailure(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isDefinitiveRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export function assetCreatedAtMs(asset: { created_at?: unknown }): number {
  return Number(asset.created_at) * 1000;
}

export function assetErrorMessage(asset: Record<string, unknown>): string {
  const messages = (asset.errors as { messages?: string[] } | undefined)
    ?.messages;
  return messages?.length
    ? messages.join(' ')
    : 'Mux could not process the asset.';
}
