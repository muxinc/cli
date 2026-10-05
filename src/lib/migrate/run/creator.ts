import { APIConnectionError } from '@mux/ts';
import type { Asset, AssetCreateParams } from '@mux/ts/resources/video/assets';
import { MigrationFailure } from '../errors.ts';
import type { ItemRecord } from '../state.ts';
import type { ResolveResult } from '../types.ts';
import type { CaptionStage } from './captions.ts';
import type { RunContext } from './context.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import {
  continueCommand,
  isAuthFailure,
  isDefinitiveRejection,
  MAX_PASSTHROUGH_LENGTH,
  messageOf,
  statusOf,
} from './shared.ts';

/**
 * Resolves each queued source and creates its asset, never repeating a create
 * whose outcome is unknown. See MIGRATE_SPEC.md "Duplicate prevention".
 */
export class AssetCreator<C> {
  constructor(
    private readonly ctx: RunContext<C>,
    private readonly lifecycle: AssetLifecycle<C>,
    private readonly captions: CaptionStage<C>,
  ) {}

  async createAll(): Promise<void> {
    const { ctx } = this;
    let queue = ctx.state
      .list({ states: ['discovered', 'preparing', 'resolved'] })
      .filter((record) => ctx.inScope(record.sourceId));
    if (ctx.options.limit !== undefined) {
      queue = queue.slice(0, ctx.options.limit);
    }

    const concurrency = Math.max(
      1,
      ctx.options.concurrency ?? ctx.deps.provider.defaultConcurrency,
    );
    const pending: Array<{ sourceId: string; retryAfterMs: number }> = [];
    const drain = async (records: ItemRecord[]) => {
      const worker = async () => {
        for (let record = records.shift(); record; record = records.shift()) {
          ctx.throwIfFailed();
          if (ctx.deadlinePassed()) return;
          const retryAfterMs = await this.migrateItem(record);
          if (retryAfterMs !== undefined) {
            pending.push({ sourceId: record.sourceId, retryAfterMs });
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
    };

    await drain(queue);
    // Sources that need preparation (such as a Cloudflare download being
    // generated) are retried in this run rather than left for the next one,
    // up to the preparation timeout.
    const preparationDeadline =
      performance.now() + ctx.timing.preparationTimeoutMs;
    while (pending.length > 0 && ctx.options.wait !== false) {
      ctx.throwIfFailed();
      if (performance.now() >= preparationDeadline) return;
      const waitMs = Math.min(...pending.map((p) => p.retryAfterMs));
      const remainingMs =
        ctx.deadline === undefined
          ? Number.POSITIVE_INFINITY
          : ctx.deadline - ctx.deps.clock.now();
      if (remainingMs <= 0) return;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(waitMs, remainingMs)),
      );
      if (waitMs >= remainingMs) return;
      const due = pending.splice(0).flatMap(({ sourceId }) => {
        const record = ctx.state.get(sourceId);
        return record?.state === 'preparing' ? [record] : [];
      });
      await drain(due);
    }
  }

  /** Returns the provider's retry delay when the source is still being prepared. */
  private async migrateItem(record: ItemRecord): Promise<number | undefined> {
    const { ctx } = this;
    const { sourceId, item } = record;
    if (
      item.passthrough &&
      [...item.passthrough].length > MAX_PASSTHROUGH_LENGTH
    ) {
      ctx.transition(sourceId, {
        state: 'errored',
        error: {
          code: 'PASSTHROUGH_TOO_LONG',
          message: `The passthrough for ${sourceId} is longer than Mux's limit of ${MAX_PASSTHROUGH_LENGTH} characters.`,
          hint: 'Shorten the passthrough value in the source metadata, then run `mux migrate retry`.',
        },
      });
      return;
    }

    let resolved: ResolveResult;
    let captionInputs: NonNullable<AssetCreateParams['inputs']> = [];
    try {
      resolved = await ctx.deps.provider.resolve(ctx.deps.credentials, item);
      if (resolved.kind === 'resolved') {
        captionInputs = await this.captions.prepare(record, resolved.captions);
      }
    } catch (error) {
      this.handleSourceFailure(sourceId, error);
      return;
    }
    if (resolved.kind === 'pending') {
      ctx.transition(sourceId, { state: 'preparing' });
      return resolved.retryAfterMs;
    }
    if (resolved.kind === 'unavailable') {
      ctx.transition(sourceId, {
        state: 'errored',
        error: { code: resolved.code, message: resolved.message },
      });
      return;
    }
    ctx.transition(sourceId, {
      state: 'resolved',
      fidelity: resolved.fidelity,
    });

    const params: AssetCreateParams = {
      ...ctx.options.asset,
      inputs: [{ url: resolved.url }, ...captionInputs],
      meta: {
        external_id: ctx.externalIds.for(sourceId),
        ...(item.title && { title: item.title.slice(0, 512) }),
      },
      ...(item.passthrough && { passthrough: item.passthrough }),
      ...(ctx.directives.length > 0 && {
        directives: ctx.directives.map((id) => ({ id })),
      }),
    };

    ctx.transition(sourceId, {
      state: 'creating',
      createStartedAt: ctx.deps.clock.now(),
      attempts: record.attempts + 1,
      recipeHash: ctx.options.recipeHash,
    });

    ctx.inFlight.add(sourceId);
    let asset: Asset;
    try {
      asset = await ctx.deps.mux.createAsset(params);
    } catch (error) {
      this.handleCreateFailure(sourceId, error);
      return;
    } finally {
      ctx.inFlight.delete(sourceId);
      ctx.changed();
    }
    this.lifecycle.recordAsset(sourceId, asset);
  }

  /**
   * A failure while resolving a source errors that item and the run goes on,
   * except for authentication failures, which would fail every item.
   */
  private handleSourceFailure(sourceId: string, error: unknown): void {
    if (isAuthFailure(error)) throw error;
    this.ctx.transition(sourceId, {
      state: 'errored',
      error: {
        code:
          error instanceof MigrationFailure
            ? error.code
            : 'SOURCE_RESOLVE_FAILED',
        message: messageOf(error),
        next_command: 'mux migrate retry',
      },
    });
  }

  private handleCreateFailure(sourceId: string, error: unknown): void {
    // A dropped connection or a 5xx response does not say whether Mux created
    // the asset. The item stays in `creating` until its created event arrives
    // or the next run finds the asset by external ID.
    if (error instanceof APIConnectionError) return;
    const status = statusOf(error);
    if (status === undefined) throw error;
    if (status === 401 || status === 403) {
      this.ctx.transition(sourceId, { state: 'discovered' });
      throw new MigrationFailure({
        code: 'MUX_UNAUTHORIZED',
        message: `Mux rejected the asset create request with HTTP ${status}: ${messageOf(error)}`,
        hint: "Run 'mux login' again, or use a token with Mux Video write access.",
        next_command: continueCommand(this.ctx.options),
      });
    }
    if (status === 429) {
      this.ctx.transition(sourceId, { state: 'discovered' });
      return;
    }
    if (isDefinitiveRejection(status)) {
      this.ctx.transition(sourceId, {
        state: 'errored',
        error: {
          code: 'MUX_ASSET_CREATE_REJECTED',
          message: (error as Error).message,
          next_command: 'mux migrate retry',
        },
      });
    }
  }
}
