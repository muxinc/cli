import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface DeleteNewAssetStaticRenditionsOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteNewAssetStaticRenditionsCommand = new Command()
  .description(
    'Delete static rendition settings for new assets created by a live stream',
  )
  .arguments('<stream-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (
      options: DeleteNewAssetStaticRenditionsOptions,
      streamId: string,
    ) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        if (!options.force) {
          if (wantsJson(options)) {
            throw new Error(
              'Deletion requires the --force flag with --json or in agent mode',
            );
          }

          const confirmed = await confirmPrompt({
            message: `Are you sure you want to delete static rendition settings for live stream ${streamId}?`,
            default: false,
          });

          if (!confirmed) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        await mux.video.liveStreams.deleteNewAssetSettingsStaticRenditions(
          streamId,
        );

        if (wantsJson(options)) {
          console.log(JSON.stringify({ success: true, streamId }, null, 2));
        } else {
          console.log(
            `Static rendition settings for live stream ${streamId} deleted successfully`,
          );
        }
      } catch (error) {
        await handleCommandError(error, 'live', 'delete', options);
      }
    },
  );
