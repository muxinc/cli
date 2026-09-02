import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { printShots } from './_shared.ts';

interface GenerateOptions {
  json?: boolean;
}

export const generateCommand = new Command()
  .description(
    'Generate shot detection data for an asset (reused by Robots jobs)',
  )
  .arguments('<asset-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GenerateOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const shots = await mux.video.assets.generateShots(assetId);

      if (wantsJson(options)) {
        console.log(JSON.stringify(shots, null, 2));
      } else {
        console.log(`Shot generation requested for asset ${assetId}.\n`);
        printShots(assetId, shots);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'shots generate', options);
    }
  });
