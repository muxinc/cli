import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a simulcast target for a live stream')
  .arguments('<stream-id:string> <target-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, streamId: string, targetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const target = await mux.video.liveStreams.retrieveSimulcastTarget(
        streamId,
        targetId,
      );

      if (options.json) {
        console.log(JSON.stringify(target, null, 2));
      } else {
        console.log(`Simulcast Target ID: ${target.id}`);
        console.log(`  URL: ${target.url}`);
        if (target.passthrough) {
          console.log(`  Passthrough: ${target.passthrough}`);
        }
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
