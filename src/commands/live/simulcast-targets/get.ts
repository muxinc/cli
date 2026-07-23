import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

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

      if (wantsJson(options)) {
        console.log(JSON.stringify(target, null, 2));
      } else {
        console.log(`Simulcast Target ID: ${target.id}`);
        console.log(`  URL: ${target.url}`);
        if (target.passthrough) {
          console.log(`  Passthrough: ${target.passthrough}`);
        }
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'get', options);
    }
  });
