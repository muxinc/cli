import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

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
          if (options.json) {
            throw new Error(
              'Deletion requires --force flag when using --json output',
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

        if (options.json) {
          console.log(JSON.stringify({ success: true, streamId }, null, 2));
        } else {
          console.log(
            `Static rendition settings for live stream ${streamId} deleted successfully`,
          );
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
    },
  );
