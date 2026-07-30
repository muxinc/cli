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
  .description('Delete a static rendition from an asset')
  .arguments('<asset-id:string> <rendition-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (options: DeleteOptions, assetId: string, renditionId: string) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        if (!options.force) {
          if (wantsJson(options)) {
            throw new Error(
              'Deletion requires the --force flag with --json or in agent mode',
            );
          }

          const confirmed = await confirmPrompt({
            message: `Are you sure you want to delete static rendition ${renditionId}?`,
            default: false,
          });

          if (!confirmed) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        await mux.video.assets.deleteStaticRendition(assetId, renditionId);

        if (wantsJson(options)) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: `Static rendition ${renditionId} deleted from asset ${assetId}`,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(
            `Static rendition ${renditionId} deleted from asset ${assetId}`,
          );
        }
      } catch (error) {
        await handleCommandError(error, 'assets', 'delete', options);
      }
    },
  );
