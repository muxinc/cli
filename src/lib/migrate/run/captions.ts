import type { AssetCreateParams } from '@mux/ts/resources/video/assets';
import { MigrationFailure } from '../errors.ts';
import type { ItemRecord, PendingCaption } from '../state.ts';
import type { CaptionSource } from '../types.ts';
import type { RunContext } from './context.ts';
import { attachCaptionCommand, captionInput, messageOf } from './shared.ts';

/**
 * Turns source captions into asset inputs, and cleans up captions it uploaded
 * once Mux has ingested them. See MIGRATE_SPEC.md "Captions".
 */
export class CaptionStage<C> {
  private readonly cleanups = new Map<string, Promise<void>>();
  private readonly saved = new Set<string>();

  constructor(private readonly ctx: RunContext<C>) {
    ctx.onTransition((record) => {
      if (
        (record.state === 'ready' || record.state === 'errored') &&
        record.hostedCaptions.length > 0
      ) {
        this.scheduleCleanup(record.sourceId);
      }
    });
  }

  /**
   * Captions supplied as text are uploaded to the host bucket when one is
   * configured, or saved locally and recorded as pending.
   */
  async prepare(
    record: ItemRecord,
    captions: CaptionSource[],
  ): Promise<NonNullable<AssetCreateParams['inputs']>> {
    const { state, deps, migrationId } = this.ctx;
    const inputs: NonNullable<AssetCreateParams['inputs']> = [];
    const hosted: string[] = [];
    const pending: PendingCaption[] = [];
    const handler = deps.captions;
    for (const caption of captions) {
      if (caption.kind === 'url') {
        inputs.push(captionInput(caption.url, caption));
        continue;
      }
      if (!handler) {
        this.ctx.warn({
          code: 'CAPTIONS_SKIPPED',
          message: `A ${caption.language} caption for ${record.sourceId} was skipped because no caption storage is configured.`,
        });
        continue;
      }
      if (handler.host) {
        const key = `mux-migrate/${migrationId}/${record.sourceId}/${caption.language}.${caption.format}`;
        // Recorded before uploading, so a crash mid-upload still leaves a
        // record for cleanup. Deleting an object that was never written is
        // harmless.
        hosted.push(key);
        state.update(record.sourceId, {
          hostedCaptions: [...new Set([...record.hostedCaptions, ...hosted])],
        });
        try {
          inputs.push(
            captionInput(await handler.host.upload(key, caption), caption),
          );
        } catch (error) {
          throw new MigrationFailure({
            code: 'CAPTIONS_UPLOAD_FAILED',
            message: `Could not upload the ${caption.language} caption for ${record.sourceId} to the host bucket: ${messageOf(error)}`,
            hint: 'Check captions.host_bucket and its credentials, then run `mux migrate retry`.',
          });
        }
      } else {
        let path: string;
        try {
          path = await handler.saveLocal(record.sourceId, caption);
        } catch (error) {
          throw new MigrationFailure({
            code: 'CAPTIONS_SAVE_FAILED',
            message: `Could not save the ${caption.language} caption for ${record.sourceId}: ${messageOf(error)}`,
          });
        }
        pending.push({
          language: caption.language,
          path,
          ...(caption.label && { label: caption.label }),
          closedCaptions: caption.closedCaptions,
        });
      }
    }
    if (pending.length > 0) {
      const languages = new Set(pending.map((caption) => caption.language));
      state.update(record.sourceId, {
        pendingCaptions: [
          ...record.pendingCaptions.filter((c) => !languages.has(c.language)),
          ...pending,
        ],
      });
      this.saved.add(record.sourceId);
    }
    return inputs;
  }

  /**
   * Deletes uploaded caption objects once Mux has finished ingesting the text
   * tracks, or right away when the item errored. Uploads still being ingested
   * after the cleanup timeout are left for the next run.
   */
  scheduleCleanup(sourceId: string): void {
    const { state, deps, timing } = this.ctx;
    const host = deps.captions?.host;
    if (this.cleanups.has(sourceId) || !host) return;
    const cleanup = (async () => {
      const deadline = performance.now() + timing.captionCleanupTimeoutMs;
      while (true) {
        const record = state.get(sourceId);
        if (!record || record.hostedCaptions.length === 0) return;
        if (record.state === 'ready' && record.assetId) {
          const asset = await deps.mux.retrieveAsset(record.assetId);
          const ingesting = (asset.tracks ?? []).some(
            (track) => track.type === 'text' && track.status === 'preparing',
          );
          if (ingesting) {
            if (performance.now() >= deadline) return;
            await new Promise((resolve) =>
              setTimeout(resolve, timing.captionCleanupPollMs),
            );
            continue;
          }
        }
        const remaining: string[] = [];
        for (const key of record.hostedCaptions) {
          try {
            await host.remove(key);
          } catch (error) {
            remaining.push(key);
            this.ctx.warn({
              code: 'CAPTION_CLEANUP_FAILED',
              message: `Could not delete the uploaded caption ${key}: ${messageOf(error)}`,
              hint: 'The next run tries again. You can also delete the object from the bucket yourself.',
            });
          }
        }
        state.update(sourceId, { hostedCaptions: remaining });
        return;
      }
    })()
      .catch((error) => {
        this.ctx.warn({
          code: 'CAPTION_CLEANUP_FAILED',
          message: `Could not check whether the captions for ${sourceId} were ingested: ${messageOf(error)}`,
          hint: 'The next run tries again.',
        });
      })
      .finally(() => this.cleanups.delete(sourceId));
    this.cleanups.set(sourceId, cleanup);
  }

  /** Waits for cleanups already started. */
  async settle(): Promise<void> {
    await Promise.all(this.cleanups.values());
  }

  /** One warning per caption saved this run, with the command that attaches it. */
  reportPending(): void {
    for (const sourceId of this.saved) {
      const record = this.ctx.state.get(sourceId);
      if (!record?.assetId) continue;
      for (const caption of record.pendingCaptions) {
        this.ctx.warn({
          code: 'CAPTIONS_PENDING',
          message: `The ${caption.language} caption for ${sourceId} was saved to ${caption.path} because the source provides caption text, not a URL. Host the file and attach it to asset ${record.assetId}.`,
          hint: 'Set captions.host_bucket in the recipe to upload captions to a bucket you own automatically.',
          next_command: attachCaptionCommand(record.assetId, caption),
        });
      }
    }
  }
}
