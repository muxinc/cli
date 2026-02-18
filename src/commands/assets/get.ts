import { Command } from '@cliffy/command';
import { formatAsset } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific Mux video asset')
  .arguments('<asset-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, assetId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Fetch asset details
      const asset = await mux.video.assets.retrieve(assetId);

      if (options.json) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
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
