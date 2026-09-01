import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List the webhooks configured for this environment')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const webhooks = await mux.system.webhooks.list();

      if (wantsJson(options)) {
        const data = [];
        for await (const webhook of webhooks) {
          data.push(webhook);
        }
        console.log(JSON.stringify({ data }, null, 2));
      } else {
        console.log('Webhooks:');
        let hasWebhooks = false;
        for await (const webhook of webhooks) {
          hasWebhooks = true;
          const status = webhook.enabled ? 'enabled' : 'disabled';
          console.log(`  ${webhook.id}  [${status}]  ${webhook.address}`);
        }

        if (!hasWebhooks) {
          console.log(
            "  No webhooks found. Run 'mux webhooks create --address <url>' to add one.",
          );
        }
      }
    } catch (error) {
      await handleCommandError(error, 'webhooks', 'list', options);
    }
  });
