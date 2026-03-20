import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface EnableOptions {
  json?: boolean;
}

export const enableCommand = new Command()
  .description(
    'Enable a disabled live stream, allowing it to accept new connections',
  )
  .arguments('<stream-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: EnableOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      await mux.video.liveStreams.enable(streamId);

      if (options.json) {
        console.log(JSON.stringify({ success: true, streamId }, null, 2));
      } else {
        console.log(`Live stream ${streamId} enabled successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'enable', options);
    }
  });
