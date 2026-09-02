import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface CreateOptions {
  address: string;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Create a webhook that delivers Mux events to a URL')
  .option(
    '--address <address:string>',
    'Publicly accessible URL that receives webhook events',
    { required: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const webhook = await mux.system.webhooks.create({
        address: options.address,
      });

      if (wantsJson(options)) {
        console.log(JSON.stringify(webhook, null, 2));
      } else {
        console.log('Webhook created successfully');
        console.log(`  ID: ${webhook.id}`);
        console.log(`  Address: ${webhook.address}`);
        console.log(`  Enabled: ${webhook.enabled}`);
        if (webhook.signing_secret) {
          console.log(`  Signing secret: ${webhook.signing_secret}`);
          console.log(
            '\nStore the signing secret securely; use it to verify webhook signatures.',
          );
        }
      }
    } catch (error) {
      await handleCommandError(error, 'webhooks', 'create', options);
    }
  });
