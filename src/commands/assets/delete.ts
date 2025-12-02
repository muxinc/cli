import { Command } from '@cliffy/command';
import { Confirm } from '@cliffy/prompt';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Delete a Mux video asset')
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

        const confirmed = await Confirm.prompt({
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
