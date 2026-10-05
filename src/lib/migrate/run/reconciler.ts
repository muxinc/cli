import type { Asset } from '@mux/ts/resources/video/assets';
import type { MuxEvent, StreamMessage } from '../types.ts';
import type { CaptionStage } from './captions.ts';
import type { RunContext } from './context.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import {
  ADOPTION_WINDOW_MS,
  assetCreatedAtMs,
  isAuthFailure,
  messageOf,
} from './shared.ts';

/**
 * Keeps the state file in step with Mux: applies webhook events as they
 * arrive, and catches up after any gap in the stream by asking Mux directly.
 */
export class Reconciler<C> {
  constructor(
    private readonly ctx: RunContext<C>,
    private readonly lifecycle: AssetLifecycle<C>,
    private readonly captions: CaptionStage<C>,
  ) {}

  async consume(
    stream: AsyncIterable<StreamMessage>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      for await (const message of stream) {
        if (signal.aborted) break;
        if (message.kind === 'reconnected') {
          await this.reconcileQuietly();
        } else {
          this.handleEvent(message.event);
        }
      }
    } catch (error) {
      if (!signal.aborted) this.ctx.fail(error);
    }
  }

  private handleEvent(event: MuxEvent): void {
    const lifecycle = this.lifecycle;
    if (!event.type.startsWith('video.asset.')) return;
    const sourceId = lifecycle.sourceIdFor(event.data);
    if (!sourceId) return;
    const record = this.ctx.state.get(sourceId);
    if (!record) return;
    const asset = event.data as unknown as Asset;

    switch (event.type) {
      case 'video.asset.created':
        if (lifecycle.withinAdoptionWindow(record, asset)) {
          lifecycle.recordAsset(sourceId, asset);
        }
        return;
      case 'video.asset.ready':
        if (!record.assetId && lifecycle.withinAdoptionWindow(record, asset)) {
          lifecycle.recordAsset(sourceId, asset);
        }
        lifecycle.markReady(sourceId, asset);
        return;
      case 'video.asset.errored':
        lifecycle.markErrored(sourceId, asset);
        return;
    }
  }

  /**
   * Brings in-flight items up to date after a gap in the event stream: at the
   * start of a run, after a reconnect, and periodically as a safety net.
   */
  async reconcile({ resume = false } = {}): Promise<void> {
    const { state, deps } = this.ctx;
    const lifecycle = this.lifecycle;
    await this.adoptOrphanedCreates(resume);

    if (resume) {
      for (const record of state.list({ states: ['ready'] })) {
        if (record.hostedCaptions.length > 0) {
          this.captions.scheduleCleanup(record.sourceId);
        }
      }
    }

    for (const record of state.list({ states: ['processing'] })) {
      if (!record.assetId) continue;
      const asset = await deps.mux.retrieveAsset(record.assetId);
      if (asset.status === 'ready') lifecycle.markReady(record.sourceId, asset);
      else if (asset.status === 'errored') {
        lifecycle.markErrored(record.sourceId, asset);
      }
    }
  }

  /** Background reconciles report failures instead of stopping the run. */
  async reconcileQuietly(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      if (isAuthFailure(error)) {
        this.ctx.fail(error);
        return;
      }
      this.ctx.warn({
        code: 'RECONCILE_FAILED',
        message: `Could not refresh in-flight items: ${messageOf(error)}`,
        hint: 'The run keeps going and tries again shortly.',
      });
    }
  }

  /**
   * Items in `creating` with no request in flight lost their create response.
   * The asset list has no filters, so scan it newest first back to the oldest
   * create attempt and match by external ID. On resume, an item with no match
   * was never created and is queued again.
   */
  private async adoptOrphanedCreates(resume: boolean): Promise<void> {
    const ctx = this.ctx;
    const lifecycle = this.lifecycle;
    const orphans = ctx.state
      .list({ states: ['creating'] })
      .filter((record) => !ctx.inFlight.has(record.sourceId));
    if (orphans.length === 0) return;

    const pending = new Map(orphans.map((record) => [record.sourceId, record]));
    const oldest = Math.min(
      ...orphans.map((record) => record.createStartedAt ?? 0),
    );
    for await (const asset of ctx.deps.mux.listAssets()) {
      if (assetCreatedAtMs(asset) < oldest - ADOPTION_WINDOW_MS) break;
      const sourceId = lifecycle.sourceIdFor(
        asset as unknown as Record<string, unknown>,
      );
      const record = sourceId ? pending.get(sourceId) : undefined;
      if (!record || !lifecycle.withinAdoptionWindow(record, asset)) continue;
      if (asset.status === 'errored') continue;
      pending.delete(record.sourceId);
      lifecycle.recordAsset(record.sourceId, asset);
      if (pending.size === 0) break;
    }

    if (!resume) return;
    for (const record of pending.values()) {
      ctx.transition(record.sourceId, { state: 'discovered' });
    }
  }
}
