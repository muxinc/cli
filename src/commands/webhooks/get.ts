import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific webhook')
  .arguments('<webhook-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, webhookId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const webhook = await mux.system.webhooks.retrieve(webhookId);

      if (wantsJson(options)) {
        console.log(JSON.stringify(webhook, null, 2));
      } else {
        console.log(`Webhook ID: ${webhook.id}`);
        console.log(`Address: ${webhook.address}`);
        console.log(`Enabled: ${webhook.enabled}`);
        console.log(`Created: ${webhook.created_at}`);
      }
    } catch (error) {
      await handleCommandError(error, 'webhooks', 'get', options);
    }
  });
