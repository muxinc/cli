import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

interface CancelOptions {
  force?: boolean;
  json?: boolean;
}

export const cancelCommand = new Command()
  .description('Cancel a waiting direct upload')
  .arguments('<upload-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CancelOptions, uploadId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      if (!options.force) {
        if (options.json) {
          throw new Error(
            'Cancellation requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to cancel upload ${uploadId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Cancellation cancelled.');
          return;
        }
      }

      const upload = await mux.video.uploads.cancel(uploadId);

      if (options.json) {
        console.log(JSON.stringify(upload, null, 2));
      } else {
        console.log(`Upload ${uploadId} cancelled successfully`);
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
