import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { getDefaultEnvironment } from '../../lib/config.ts';
import { appendEvent, type StoredEvent } from '../../lib/events-store.ts';
import { getAuthHeaders, getMuxBaseUrl } from '../../lib/mux.ts';
import { parseSSEStream } from '../../lib/sse.ts';
import {
  buildSignedHeaders,
  getSigningSecret,
} from '../../lib/webhook-signing.ts';

interface ListenOptions {
  forwardTo?: string;
  json?: boolean;
}

export const listenCommand = new Command()
  .description(
    'Listen for webhook events from Mux in real-time via Server-Sent Events',
  )
  .option(
    '--forward-to <url:string>',
    'POST received events to a local URL in real-time',
  )
  .option('--json', 'Output raw JSON per event')
  .action(async (options: ListenOptions) => {
    const controller = new AbortController();
    let eventCount = 0;
    let forwardSuccess = 0;
    let forwardFail = 0;

    function printSummary() {
      if (options.json) return;
      console.log(`\n${eventCount} event(s) received.`);
      if (options.forwardTo) {
        console.log(
          `${forwardSuccess} forwarded successfully, ${forwardFail} failed.`,
        );
      }
    }

    process.on('SIGINT', () => {
      controller.abort();
      printSummary();
      process.exit(0);
    });

    try {
      const env = await getDefaultEnvironment();
      if (!env) {
        console.error("Not logged in. Please run 'mux login' to authenticate.");
        process.exit(1);
      }

      const headers = await getAuthHeaders();
      const baseUrl = getMuxBaseUrl();
      const url = `${baseUrl}/system/v1/webhook-events/stream`;

      let signingSecret: string | undefined;
      if (options.forwardTo) {
        signingSecret = await getSigningSecret(env.name);
      }

      if (!options.json) {
        console.log(`Connecting to ${url}...`);
        if (options.forwardTo) {
          console.log(`Forwarding events to ${options.forwardTo}`);
          console.log(
            `Webhook signing secret: ${colors.bold(signingSecret as string)}`,
          );
          console.log(
            colors.dim(
              'Set MUX_WEBHOOK_SECRET in your app to verify forwarded events.\n' +
                'If you add it to .env, restart your dev server to pick up the change.',
            ),
          );
        }
        console.log('Listening for webhook events (Ctrl+C to stop)\n');
      }

      const response = await fetch(url, {
        headers: {
          ...headers,
          Accept: '*/*',
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        console.error(
          `Access denied (${response.status}). Your API token may not have "system" permissions.\n` +
            'Manage your access tokens at: https://dashboard.mux.com/settings/access-tokens',
        );
        process.exit(1);
      }

      if (!response.ok) {
        console.error(
          `Unexpected response from ${url}: ${response.status} ${response.statusText}`,
        );
        process.exit(1);
      }

      if (!response.body) {
        console.error('No response body received from SSE endpoint.');
        process.exit(1);
      }

      for await (const sseEvent of parseSSEStream(
        response.body,
        controller.signal,
      )) {
        if (sseEvent.event === 'connected') {
          if (!options.json) {
            console.log(colors.dim('Connected to event stream.\n'));
          }
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(sseEvent.data);
        } catch {
          continue;
        }

        const eventId = (parsed.id as string) ?? 'unknown';
        const eventType = (parsed.type as string) ?? sseEvent.event;
        const timestamp = new Date().toISOString();

        const storedEvent: StoredEvent = {
          id: eventId,
          type: eventType,
          timestamp,
          environmentName: env.name,
          payload: parsed,
        };

        await appendEvent(storedEvent);
        eventCount++;

        if (options.json) {
          console.log(JSON.stringify(parsed));
        } else {
          const time = new Date().toLocaleTimeString();
          let line = `[${time}]  ${eventType.padEnd(30)}  ${eventId}`;

          if (options.forwardTo && signingSecret) {
            try {
              const body = JSON.stringify(parsed);
              const fwdResponse = await fetch(options.forwardTo, {
                method: 'POST',
                headers: buildSignedHeaders(body, signingSecret),
                body,
              });
              const status = fwdResponse.status;
              if (status >= 200 && status < 300) {
                forwardSuccess++;
                line += `  ${colors.green(`[${status}]`)}`;
              } else {
                forwardFail++;
                line += `  ${colors.red(`[${status}]`)}`;
              }
            } catch {
              forwardFail++;
              line += `  ${colors.red('[ERR]')}`;
            }
          }

          console.log(line);
        }
      }

      // Stream ended naturally (server closed connection)
      if (!options.json) {
        console.log('\nStream ended.');
      }
      printSummary();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Ctrl+C already handled by SIGINT
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        const baseUrl = getMuxBaseUrl();
        const streamUrl = `${baseUrl}/system/v1/webhook-events/stream`;

        if (
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('getaddrinfo') ||
          errorMessage.includes('resolve')
        ) {
          console.error(
            `Error: Could not resolve hostname for ${baseUrl}\n` +
              'Check that MUX_BASE_URL is set correctly and the host is reachable.',
          );
        } else if (
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ECONNRESET')
        ) {
          console.error(
            `Error: Connection refused at ${streamUrl}\n` +
              'The server may be down or the URL may be incorrect.',
          );
        } else {
          console.error(`Error connecting to ${streamUrl}: ${errorMessage}`);
        }
      }
      process.exit(1);
    }
  });
