import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { formatAsset } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

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

      if (wantsJson(options)) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        formatAsset(asset);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'get', options);
    }
  });
