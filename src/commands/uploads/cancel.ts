import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

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
        if (wantsJson(options)) {
          throw new Error(
            'Cancellation requires the --force flag with --json or in agent mode',
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

      if (wantsJson(options)) {
        console.log(JSON.stringify(upload, null, 2));
      } else {
        console.log(`Upload ${uploadId} cancelled successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'uploads', 'cancel', options);
    }
  });
