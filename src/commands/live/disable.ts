import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface DisableOptions {
  json?: boolean;
}

export const disableCommand = new Command()
  .description(
    'Disable a live stream, preventing it from accepting new connections',
  )
  .arguments('<stream-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DisableOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      await mux.video.liveStreams.disable(streamId);

      if (wantsJson(options)) {
        console.log(JSON.stringify({ success: true, streamId }, null, 2));
      } else {
        console.log(`Live stream ${streamId} disabled successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'disable', options);
    }
  });
