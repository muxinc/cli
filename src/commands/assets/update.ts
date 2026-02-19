import { Command } from '@cliffy/command';
import { formatAsset } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateOptions {
  title?: string;
  creatorId?: string;
  externalId?: string;
  passthrough?: string;
  json?: boolean;
}

export const updateCommand = new Command()
  .description(
    'Update metadata fields on a Mux video asset (title, passthrough, etc.)',
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
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, assetId: string) => {
    try {
      const hasField =
        options.title !== undefined ||
        options.creatorId !== undefined ||
        options.externalId !== undefined ||
        options.passthrough !== undefined;

      if (!hasField) {
        throw new Error(
          'At least one field must be specified: --title, --creator-id, --external-id, or --passthrough',
        );
      }

      const mux = await createAuthenticatedMuxClient();

      const updateParams: Record<string, unknown> = {};

      if (options.passthrough !== undefined) {
        updateParams.passthrough = options.passthrough;
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

      const asset = await mux.video.assets.update(assetId, updateParams);

      if (options.json) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        console.log('Asset updated successfully.\n');
        formatAsset(asset);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
