import { Command } from '@cliffy/command';
import type { WebhookUpdateParams } from '@mux/ts/resources/system/webhooks';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface UpdateOptions {
  address?: string;
  enable?: boolean;
  disable?: boolean;
  json?: boolean;
}

export const updateCommand = new Command()
  .description('Update the address of a webhook, or enable/disable it')
  .arguments('<webhook-id:string>')
  .option(
    '--address <address:string>',
    'Publicly accessible URL that receives webhook events',
  )
  .option('--enable', 'Enable delivery of events to this webhook')
  .option('--disable', 'Disable delivery of events to this webhook')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, webhookId: string) => {
    try {
      if (options.enable && options.disable) {
        throw new Error('--enable and --disable cannot be combined');
      }

      const params: WebhookUpdateParams = {};
      if (options.address !== undefined) {
        params.address = options.address;
      }
      if (options.enable) {
        params.enabled = true;
      }
      if (options.disable) {
        params.enabled = false;
      }

      if (Object.keys(params).length === 0) {
        throw new Error(
          'At least one field must be specified: --address, --enable, or --disable',
        );
      }

      const mux = await createAuthenticatedMuxClient();

      const webhook = await mux.system.webhooks.update(webhookId, params);

      if (wantsJson(options)) {
        console.log(JSON.stringify(webhook, null, 2));
      } else {
        console.log('Webhook updated successfully');
        console.log(`  ID: ${webhook.id}`);
        console.log(`  Address: ${webhook.address}`);
        console.log(`  Enabled: ${webhook.enabled}`);
      }
    } catch (error) {
      await handleCommandError(error, 'webhooks', 'update', options);
    }
  });
