import { Command } from '@cliffy/command';
import { formatAsset } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateMasterAccessOptions {
  masterAccess: string;
  json?: boolean;
}

export const updateMasterAccessCommand = new Command()
  .description('Update master access settings for a Mux video asset')
  .arguments('<asset-id:string>')
  .option(
    '--master-access <masterAccess:string>',
    'Master access setting (temporary or none)',
    {
      required: true,
      value: (value: string): string => {
        if (value !== 'temporary' && value !== 'none') {
          throw new Error(
            `Invalid master access: ${value}. Must be "temporary" or "none".`,
          );
        }
        return value;
      },
    },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateMasterAccessOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const asset = await mux.video.assets.updateMasterAccess(assetId, {
        master_access: options.masterAccess as 'temporary' | 'none',
      });

      if (options.json) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        console.log('Master access updated successfully.\n');
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
