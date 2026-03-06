import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { getCurrentEnvironment, updateEnvironment } from '@/lib/config.ts';
import { appendEvent, type StoredEvent } from '@/lib/events-store.ts';
import { getAuthHeaders, getMuxBaseUrl } from '@/lib/mux.ts';
import { parseSSEStream } from '@/lib/sse.ts';
import { buildSignedHeaders, getSigningSecret } from '@/lib/webhook-signing.ts';

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

    const MAX_BACKOFF_MS = 30_000;
    const INITIAL_BACKOFF_MS = 1_000;
    let backoffMs = INITIAL_BACKOFF_MS;

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

    const env = await getCurrentEnvironment();
    if (!env) {
      console.error("Not logged in. Please run 'mux login' to authenticate.");
      process.exit(1);
    }

    // Save the forward URL for use by replay/browse
    if (options.forwardTo && options.forwardTo !== env.environment.forwardUrl) {
      await updateEnvironment(env.name, {
        forwardUrl: options.forwardTo,
      });
    }

    const authHeaders = await getAuthHeaders();
    const baseUrl = getMuxBaseUrl();
    const url = `${baseUrl}/system/v1/webhook-events/stream`;

    let signingSecret: string | undefined;
    if (options.forwardTo) {
      signingSecret = await getSigningSecret(env.name);
    }

    if (!options.json) {
      console.log(`Connecting...`);
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

    while (!controller.signal.aborted) {
      try {
        const response = await fetch(url, {
          headers: {
            ...authHeaders,
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
          throw new Error(
            `Server returned ${response.status} ${response.statusText}`,
          );
        }

        if (!response.body) {
          throw new Error('No response body received from SSE endpoint');
        }

        for await (const sseEvent of parseSSEStream(
          response.body,
          controller.signal,
        )) {
          if (sseEvent.event === 'connected') {
            backoffMs = INITIAL_BACKOFF_MS;
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
            environmentId: env.environment.environmentId ?? env.name,
            payload: parsed,
          };

          appendEvent(storedEvent);
          eventCount++;

          let forwardStatus: string | undefined;
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
                forwardStatus = `${status}`;
              } else {
                forwardFail++;
                forwardStatus = `${status}`;
              }
            } catch {
              forwardFail++;
              forwardStatus = 'ERR';
            }
          }

          if (options.json) {
            console.log(JSON.stringify(parsed));
          } else {
            const time = new Date().toLocaleTimeString();
            let line = `[${time}]  ${eventType.padEnd(30)}  ${eventId}`;

            if (forwardStatus) {
              const isSuccess =
                forwardStatus !== 'ERR' &&
                Number(forwardStatus) >= 200 &&
                Number(forwardStatus) < 300;
              line += isSuccess
                ? `  ${colors.green(`[${forwardStatus}]`)}`
                : `  ${colors.red(`[${forwardStatus}]`)}`;
            }

            console.log(line);
          }
        }

        // Stream ended naturally (server closed connection) — reconnect
        if (!options.json) {
          console.log(colors.dim('\nStream ended.'));
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('getaddrinfo')
        ) {
          console.error(
            `Error: Could not resolve hostname for ${baseUrl}\n` +
              'Check that MUX_BASE_URL is set correctly and the host is reachable.',
          );
          process.exit(1);
        }

        if (!options.json) {
          if (
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ECONNRESET') ||
            errorMessage.includes('socket connection was closed')
          ) {
            console.log(colors.dim('Connection lost.'));
          } else {
            console.log(colors.dim(`Connection interrupted: ${errorMessage}`));
          }
        } else {
          console.error(JSON.stringify({ error: errorMessage }));
        }
      }

      // Backoff before reconnecting
      if (!controller.signal.aborted) {
        if (!options.json) {
          console.log(colors.dim(`Reconnecting in ${backoffMs / 1000}s...`));
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, backoffMs);
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  });
