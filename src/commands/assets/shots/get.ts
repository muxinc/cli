import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { printShots } from './_shared.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get the shot detection data for an asset')
  .arguments('<asset-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const shots = await mux.video.assets.retrieveShots(assetId);

      if (wantsJson(options)) {
        console.log(JSON.stringify(shots, null, 2));
      } else {
        printShots(assetId, shots);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'shots get', options);
    }
  });
