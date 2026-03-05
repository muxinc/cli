import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { getDefaultEnvironment } from '../../lib/config.ts';
import {
  generateExampleWebhook,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '../../lib/example-webhooks.ts';
import {
  buildSignedHeaders,
  getSigningSecret,
} from '../../lib/webhook-signing.ts';

interface TriggerOptions {
  forwardTo: string;
  json?: boolean;
}

export const triggerCommand = new Command()
  .description('Send an example webhook event to a local URL for testing')
  .arguments('<event-type:string>')
  .option(
    '--forward-to <url:string>',
    'Local URL to POST the example event to',
    { required: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: TriggerOptions, eventType: string) => {
    try {
      if (!WEBHOOK_EVENT_TYPES.includes(eventType as WebhookEventType)) {
        console.error(`Unknown event type: ${eventType}\n`);
        console.error('Available event types:');
        for (const t of WEBHOOK_EVENT_TYPES) {
          console.error(`  ${t}`);
        }
        process.exit(1);
      }

      const env = await getDefaultEnvironment();
      if (!env) {
        console.error("Not logged in. Please run 'mux login' to authenticate.");
        process.exit(1);
      }

      const payload = generateExampleWebhook(
        eventType as WebhookEventType,
        env.name,
        env.environment.tokenId.slice(0, 6),
      );

      const body = JSON.stringify(payload);
      const signingSecret = await getSigningSecret(env.name);

      const response = await fetch(options.forwardTo, {
        method: 'POST',
        headers: buildSignedHeaders(body, signingSecret),
        body,
      });

      const status = response.status;

      if (options.json) {
        console.log(JSON.stringify({ status, eventType, payload }, null, 2));
      } else if (status >= 200 && status < 300) {
        console.log(
          `${colors.green(`[${status}]`)} Sent ${eventType} to ${options.forwardTo}`,
        );
      } else {
        console.log(
          `${colors.red(`[${status}]`)} Failed to send ${eventType} to ${options.forwardTo}`,
        );
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
