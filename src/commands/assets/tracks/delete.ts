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
  .description(
    'Permanently delete a text or audio track from a Mux video asset (cannot be undone)',
  )
  .arguments('<asset-id:string> <track-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, assetId: string, trackId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      if (!options.force) {
        if (wantsJson(options)) {
          throw new Error(
            'Deletion requires the --force flag with --json or in agent mode',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete track ${trackId} from asset ${assetId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      await mux.video.assets.deleteTrack(assetId, trackId);

      if (wantsJson(options)) {
        console.log(
          JSON.stringify({ success: true, assetId, trackId }, null, 2),
        );
      } else {
        console.log(`Track ${trackId} deleted successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'delete', options);
    }
  });
