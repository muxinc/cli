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
  .description('Permanently delete a webhook (cannot be undone)')
  .arguments('<webhook-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, webhookId: string) => {
    try {
      if (!options.force) {
        if (wantsJson(options)) {
          throw new Error(
            'Deletion requires the --force flag with --json or in agent mode',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete webhook ${webhookId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      const mux = await createAuthenticatedMuxClient();

      await mux.system.webhooks.delete(webhookId);

      if (wantsJson(options)) {
        console.log(JSON.stringify({ success: true, webhookId }, null, 2));
      } else {
        console.log(`Webhook ${webhookId} deleted successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'webhooks', 'delete', options);
    }
  });
