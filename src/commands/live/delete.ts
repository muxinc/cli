import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Permanently delete a Mux live stream (cannot be undone)')
  .arguments('<stream-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, streamId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Confirm deletion unless --force flag is provided
      if (!options.force) {
        // For JSON mode, require explicit --force flag for safety
        if (wantsJson(options)) {
          throw new Error(
            'Deletion requires the --force flag with --json or in agent mode',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete live stream ${streamId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      // Delete the live stream
      await mux.video.liveStreams.delete(streamId);

      if (wantsJson(options)) {
        console.log(JSON.stringify({ success: true, streamId }, null, 2));
      } else {
        console.log(`Live stream ${streamId} deleted successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'delete', options);
    }
  });
