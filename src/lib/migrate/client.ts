import type Mux from '@mux/ts';
import { RateLimitError } from '@mux/ts';
import { RequestBucket } from './rate-limit.ts';
import type { MuxMigrateClient } from './types.ts';

/**
 * Mux's documented Video API limits for a low-priority token, which every
 * token stays within: POST requests have a bucket of 4 refilled at one per
 * second, and other methods a bucket of 20 refilled at one per second.
 * High-priority tokens allow more, but asset creation is one per second for
 * every token. See https://www.mux.com/docs/core/make-api-requests#api-rate-limits.
 */
export const CREATE_LIMIT = { capacity: 4, perSecond: 1 };
const READ_LIMIT = { capacity: 20, perSecond: 1 };

const MAX_RATE_LIMIT_ATTEMPTS = 6;

function rateLimitDelayMs(error: RateLimitError, attempt: number): number {
  const headers = error.headers;
  const ms = Number(headers?.get('retry-after-ms'));
  if (headers?.has('retry-after-ms') && Number.isFinite(ms) && ms >= 0) {
    return ms;
  }
  const seconds = Number(headers?.get('retry-after'));
  if (headers?.has('retry-after') && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return Math.min(30_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
}

export function createMuxMigrateClient(
  mux: Mux,
  options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): MuxMigrateClient {
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const creates = new RequestBucket({ ...CREATE_LIMIT, ...options });
  const reads = new RequestBucket({ ...READ_LIMIT, ...options });
  return {
    async createAsset(params) {
      // The SDK retries timeouts and 5xx responses by default, which can
      // create a second asset when the first request succeeded but its
      // response was lost. Only a 429 is safe to repeat: Mux did not
      // process the request.
      for (let attempt = 0; ; attempt++) {
        try {
          await creates.take();
          return await mux.video.assets.create(params, { maxRetries: 0 });
        } catch (error) {
          if (
            !(error instanceof RateLimitError) ||
            attempt + 1 >= MAX_RATE_LIMIT_ATTEMPTS
          ) {
            throw error;
          }
          await sleep(rateLimitDelayMs(error, attempt));
        }
      }
    },

    async retrieveAsset(assetId) {
      await reads.take();
      return mux.video.assets.retrieve(assetId);
    },

    async *listAssets() {
      await reads.take();
      let page = await mux.video.assets.list({ limit: 100 });
      while (true) {
        yield* page.getPaginatedItems();
        if (!page.hasNextPage()) return;
        await reads.take();
        page = await page.getNextPage();
      }
    },
  };
}
