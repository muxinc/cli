import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { deletePlaybackId } from '@/lib/playback-ids.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Delete a playback ID from an asset')
  .arguments('<asset-id:string> <playback-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (options: DeleteOptions, assetId: string, playbackId: string) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        if (!options.force) {
          if (wantsJson(options)) {
            throw new Error(
              'Deletion requires the --force flag with --json or in agent mode',
            );
          }

          const confirmed = await confirmPrompt({
            message: `Are you sure you want to delete playback ID ${playbackId}?`,
            default: false,
          });

          if (!confirmed) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        await deletePlaybackId(mux, assetId, playbackId);

        if (wantsJson(options)) {
          console.log(
            JSON.stringify({ success: true, assetId, playbackId }, null, 2),
          );
        } else {
          console.log(`Playback ID ${playbackId} deleted successfully`);
        }
      } catch (error) {
        await handleCommandError(error, 'assets', 'delete', options);
      }
    },
  );
