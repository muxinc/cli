import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { formatAsset } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface UpdateOptions {
  title?: string;
  creatorId?: string;
  externalId?: string;
  passthrough?: string;
  thumbnailTime?: number;
  clearThumbnailTime?: boolean;
  json?: boolean;
}

export const updateCommand = new Command()
  .description(
    'Update metadata fields on a Mux video asset (title, passthrough, thumbnail time, etc.)',
  )
  .arguments('<asset-id:string>')
  .option('--title <title:string>', 'Set meta.title (max 512 characters)')
  .option(
    '--creator-id <creatorId:string>',
    'Set meta.creator_id (max 128 characters)',
  )
  .option(
    '--external-id <externalId:string>',
    'Set meta.external_id (max 128 characters)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Set passthrough (max 255 characters)',
  )
  .option(
    '--thumbnail-time <thumbnailTime:number>',
    "Set the asset's default thumbnail time in seconds",
  )
  .option(
    '--clear-thumbnail-time',
    "Reset the asset's default thumbnail time to the default",
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, assetId: string) => {
    try {
      if (
        options.thumbnailTime !== undefined &&
        options.clearThumbnailTime !== undefined
      ) {
        throw new Error(
          '--thumbnail-time and --clear-thumbnail-time cannot be combined',
        );
      }

      const hasUpdateField =
        options.title !== undefined ||
        options.creatorId !== undefined ||
        options.externalId !== undefined ||
        options.passthrough !== undefined ||
        options.thumbnailTime !== undefined;

      if (!hasUpdateField && options.clearThumbnailTime === undefined) {
        throw new Error(
          'At least one field must be specified: --title, --creator-id, --external-id, --passthrough, --thumbnail-time, or --clear-thumbnail-time',
        );
      }

      const mux = await createAuthenticatedMuxClient();

      const updateParams: Record<string, unknown> = {};

      if (options.passthrough !== undefined) {
        updateParams.passthrough = options.passthrough;
      }

      if (options.thumbnailTime !== undefined) {
        updateParams.thumbnail_time = options.thumbnailTime;
      }

      if (
        options.title !== undefined ||
        options.creatorId !== undefined ||
        options.externalId !== undefined
      ) {
        const meta: Record<string, string> = {};
        if (options.title !== undefined) {
          meta.title = options.title;
        }
        if (options.creatorId !== undefined) {
          meta.creator_id = options.creatorId;
        }
        if (options.externalId !== undefined) {
          meta.external_id = options.externalId;
        }
        updateParams.meta = meta;
      }

      let asset = hasUpdateField
        ? await mux.video.assets.update(assetId, updateParams)
        : undefined;

      if (options.clearThumbnailTime) {
        await mux.video.assets.deleteThumbnailTime(assetId);
        asset = await mux.video.assets.retrieve(assetId);
      }

      if (!asset) {
        throw new Error(`Failed to load asset ${assetId} after update`);
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        console.log('Asset updated successfully.\n');
        formatAsset(asset);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'update', options);
    }
  });
