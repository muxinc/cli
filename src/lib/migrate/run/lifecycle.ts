import type { Asset } from '@mux/ts/resources/video/assets';
import type { ItemRecord } from '../state.ts';
import type { DirectiveRunSummary } from '../types.ts';
import type { RunContext } from './context.ts';
import {
  ADOPTION_WINDOW_MS,
  assetCreatedAtMs,
  assetErrorMessage,
  TERMINAL_RUN_STATUSES,
} from './shared.ts';
import type { DuplicateAsset } from './types.ts';

/**
 * Moves an item through its asset's life: adopting the asset, processing,
 * ready or errored, and the directive runs Mux starts once it is ready.
 * Create responses, stream events, and reconciliation all report here.
 */
export class AssetLifecycle<C> {
  readonly duplicates: DuplicateAsset[] = [];
  private readonly reportedDuplicates = new Set<string>();
  private readonly enrichingSince = new Map<string, number>();

  constructor(private readonly ctx: RunContext<C>) {}

  sourceIdFor(asset: Record<string, unknown>): string | undefined {
    const meta = asset.meta as { external_id?: unknown } | undefined;
    return this.ctx.externalIds.sourceIdFor(meta?.external_id);
  }

  /** Whether an asset was created late enough to belong to this item's create request. */
  withinAdoptionWindow(record: ItemRecord, asset: { created_at?: unknown }) {
    return (
      record.createStartedAt !== undefined &&
      assetCreatedAtMs(asset) >= record.createStartedAt - ADOPTION_WINDOW_MS
    );
  }

  /** Records an asset for an item, from a create response or a created event. */
  recordAsset(sourceId: string, asset: Asset): void {
    const record = this.ctx.state.get(sourceId);
    if (!record) return;
    if (record.assetId && record.assetId !== asset.id) {
      this.reportDuplicate(record, asset.id);
      return;
    }
    if (record.assetId === asset.id && record.state !== 'creating') return;

    const playbackIds = (asset.playback_ids ?? []).map((p) => ({
      id: p.id as string,
      policy: p.policy as string,
    }));
    this.ctx.transition(sourceId, {
      state: 'processing',
      assetId: asset.id,
      playbackIds,
    });
    if (asset.status === 'ready') this.markReady(sourceId, asset);
    if (asset.status === 'errored') this.markErrored(sourceId, asset);
  }

  markReady(sourceId: string, asset: Asset): void {
    const record = this.ctx.state.get(sourceId);
    if (!record || record.assetId !== asset.id) return;
    if (record.state !== 'processing') return;

    const attached = (asset.directives ?? []).map((d) => d.id);
    if (attached.length === 0) {
      this.ctx.transition(sourceId, { state: 'ready' });
      return;
    }
    const runs: DirectiveRunSummary[] = attached.map(
      (directiveId) =>
        record.directiveRuns.find((run) => run.directiveId === directiveId) ?? {
          runId: '',
          directiveId,
          assetId: asset.id,
          status: 'pending',
        },
    );
    this.enrichingSince.set(sourceId, this.ctx.deps.clock.now());
    this.ctx.transition(sourceId, { state: 'enriching', directiveRuns: runs });
    this.completeIfEnriched(sourceId);
  }

  markErrored(sourceId: string, asset: Asset): void {
    const record = this.ctx.state.get(sourceId);
    if (!record || record.assetId !== asset.id) return;
    this.ctx.transition(sourceId, {
      state: 'errored',
      error: {
        code: 'MUX_ASSET_ERRORED',
        message: assetErrorMessage(asset as unknown as Record<string, unknown>),
        next_command: 'mux migrate retry',
      },
    });
  }

  recordDirectiveRun(run: DirectiveRunSummary): void {
    const record = this.ctx.state.findByAssetId(run.assetId);
    if (!record) return;
    const runs = record.directiveRuns.filter(
      (existing) => existing.directiveId !== run.directiveId,
    );
    runs.push(run);
    this.ctx.state.update(record.sourceId, { directiveRuns: runs });
    this.completeIfEnriched(record.sourceId);
  }

  /**
   * An attached directive normally starts a run as soon as the asset is
   * ready. One that has not started within the timeout is reported, and the
   * item completes without it rather than holding the run open.
   */
  reportUnstartedRuns(sourceId: string): void {
    const record = this.ctx.state.get(sourceId);
    if (!record || record.state !== 'enriching') return;
    const now = this.ctx.deps.clock.now();
    const since = this.enrichingSince.get(sourceId) ?? now;
    this.enrichingSince.set(sourceId, since);
    if (now - since < this.ctx.timing.directiveStartTimeoutMs) return;
    const unstarted = record.directiveRuns.filter((run) => !run.runId);
    if (unstarted.length === 0) return;
    for (const run of unstarted) {
      this.ctx.warn({
        code: 'DIRECTIVE_RUN_NOT_STARTED',
        message: `Directive ${run.directiveId} did not start a run on asset ${record.assetId}. The asset migrated without that enrichment.`,
        hint: 'Check the directive in the Directives section of the Mux Dashboard, or start a run on the asset from there.',
      });
    }
    this.ctx.state.update(sourceId, {
      directiveRuns: record.directiveRuns.map((run) =>
        run.runId ? run : { ...run, status: 'errored' as const },
      ),
    });
    this.completeIfEnriched(sourceId);
  }

  private completeIfEnriched(sourceId: string): void {
    const record = this.ctx.state.get(sourceId);
    if (!record || record.state !== 'enriching') return;
    if (
      !record.directiveRuns.every((run) =>
        TERMINAL_RUN_STATUSES.has(run.status),
      )
    ) {
      return;
    }
    for (const run of record.directiveRuns) {
      // Runs that never started were already reported.
      if (run.status === 'completed' || !run.runId) continue;
      this.ctx.warn({
        code:
          run.status === 'partial'
            ? 'DIRECTIVE_RUN_PARTIAL'
            : 'DIRECTIVE_RUN_ERRORED',
        message: `Directive ${run.directiveId} run ${run.runId} on asset ${run.assetId} ended ${run.status}. The asset migrated; some enrichment did not complete.`,
        hint: 'Open the run in the Directives section of the Mux Dashboard to see which workflows failed.',
      });
    }
    this.ctx.transition(sourceId, { state: 'ready' });
  }

  private reportDuplicate(record: ItemRecord, duplicateAssetId: string): void {
    if (this.reportedDuplicates.has(duplicateAssetId)) return;
    this.reportedDuplicates.add(duplicateAssetId);
    const duplicate = {
      sourceId: record.sourceId,
      keptAssetId: record.assetId as string,
      duplicateAssetId,
    };
    this.duplicates.push(duplicate);
    this.ctx.warn({
      code: 'DUPLICATE_ASSET',
      message: `Source ${record.sourceId} has a second asset, ${duplicateAssetId}. The migration kept ${duplicate.keptAssetId} and did not delete the duplicate.`,
      hint: 'Delete the duplicate once you have confirmed it is not in use.',
      next_command: `mux assets delete ${duplicateAssetId}`,
    });
  }
}
