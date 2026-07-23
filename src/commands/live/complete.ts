import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface CompleteOptions {
  json?: boolean;
}

export const completeCommand = new Command()
  .description(
    'Signal that a live stream has ended and Mux should complete the recording',
  )
  .arguments('<stream-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CompleteOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      await mux.video.liveStreams.complete(streamId);

      if (wantsJson(options)) {
        console.log(JSON.stringify({ success: true, streamId }, null, 2));
      } else {
        console.log(`Live stream ${streamId} completed successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'complete', options);
    }
  });
