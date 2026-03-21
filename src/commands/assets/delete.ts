import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Permanently delete a Mux video asset (cannot be undone)')
  .arguments('<asset-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, assetId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Confirm deletion unless --force flag is provided
      if (!options.force) {
        // For JSON mode, require explicit --force flag for safety
        if (options.json) {
          throw new Error(
            'Deletion requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete asset ${assetId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      // Delete the asset
      await mux.video.assets.delete(assetId);

      if (options.json) {
        console.log(JSON.stringify({ success: true, assetId }, null, 2));
      } else {
        console.log(`Asset ${assetId} deleted successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'delete', options);
    }
  });
