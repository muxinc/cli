import { Command } from '@cliffy/command';
import { formatLiveStream } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

interface ResetStreamKeyOptions {
  force?: boolean;
  json?: boolean;
}

export const resetStreamKeyCommand = new Command()
  .description(
    'Reset the stream key for a live stream (invalidates the current key)',
  )
  .arguments('<stream-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ResetStreamKeyOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      if (!options.force) {
        if (options.json) {
          throw new Error(
            'Resetting stream key requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to reset the stream key for live stream ${streamId}? The current key will be invalidated.`,
          default: false,
        });

        if (!confirmed) {
          console.log('Reset cancelled.');
          return;
        }
      }

      const stream = await mux.video.liveStreams.resetStreamKey(streamId);

      if (options.json) {
        console.log(JSON.stringify(stream, null, 2));
      } else {
        console.log('Stream key reset successfully.\n');
        formatLiveStream(stream);
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
