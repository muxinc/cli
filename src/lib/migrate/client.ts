import type Mux from '@mux/ts';
import { RateLimitError } from '@mux/ts';
import type { MuxMigrateClient } from './types.ts';

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

export function createMuxMigrateClient(mux: Mux): MuxMigrateClient {
  return {
    async createAsset(params) {
      // The SDK retries timeouts and 5xx responses by default, which can
      // create a second asset when the first request succeeded but its
      // response was lost. Only a 429 is safe to repeat: Mux did not
      // process the request.
      for (let attempt = 0; ; attempt++) {
        try {
          return await mux.video.assets.create(params, { maxRetries: 0 });
        } catch (error) {
          if (
            !(error instanceof RateLimitError) ||
            attempt + 1 >= MAX_RATE_LIMIT_ATTEMPTS
          ) {
            throw error;
          }
          await Bun.sleep(rateLimitDelayMs(error, attempt));
        }
      }
    },

    retrieveAsset(assetId) {
      return mux.video.assets.retrieve(assetId);
    },

    async *listAssets() {
      yield* mux.video.assets.list({ limit: 100 });
    },

    async retrieveDirective(directiveId) {
      const directive = await mux.robots.directives.retrieve(directiveId);
      return {
        id: directive.id,
        name: directive.name,
        workflows: directive.workflows.map((binding) => binding.workflow),
      };
    },

    async *listDirectiveRuns(directiveId) {
      for await (const run of mux.robots.directives.runs.list(directiveId)) {
        yield {
          runId: run.run_id,
          directiveId,
          assetId: run.subject_id,
          status: run.status,
        };
      }
    },
  };
}
