import type { Asset } from '@mux/ts/resources/video/assets';
import type { ItemRecord } from '../state.ts';
import type { RunContext } from './context.ts';
import {
  ADOPTION_WINDOW_MS,
  assetCreatedAtMs,
  assetErrorMessage,
} from './shared.ts';
import type { DuplicateAsset } from './types.ts';

/**
 * Moves an item through its asset's life: adopting the asset, processing,
 * then ready or errored. Create responses, stream events, and reconciliation
 * all report here.
 */
export class AssetLifecycle<C> {
  readonly duplicates: DuplicateAsset[] = [];
  private readonly reportedDuplicates = new Set<string>();

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
    this.ctx.transition(sourceId, { state: 'ready' });
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

  private reportDuplicate(record: ItemRecord, duplicateAssetId: string): void {
    if (this.reportedDuplicates.has(duplicateAssetId)) return;
    this.reportedDuplicates.add(duplicateAssetId);
    const duplicate = {
      sourceId: record.sourceId,
      keptAssetId: record.assetId as string,
      duplicateAssetId,
    };
    this.duplicates.push(duplicate);
    this.ctx.state.recordDuplicate(duplicate);
    this.ctx.warn({
      code: 'DUPLICATE_ASSET',
      message: `Source ${record.sourceId} has a second asset, ${duplicateAssetId}. The migration kept ${duplicate.keptAssetId} and did not delete the duplicate.`,
      hint: 'Delete the duplicate once you have confirmed it is not in use.',
      next_command: `mux assets delete ${duplicateAssetId}`,
    });
  }
}
