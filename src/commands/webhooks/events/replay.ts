import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { getCurrentEnvironment, updateEnvironment } from '@/lib/config.ts';
import { getAllEvents, getEventById } from '@/lib/events-store.ts';
import {
  buildSignedHeaders,
  getSigningSecretForCurrentEnv,
} from '@/lib/webhook-signing.ts';

interface ReplayOptions {
  forwardTo?: string;
  all?: boolean;
  json?: boolean;
}

async function forwardEvent(
  url: string,
  payload: Record<string, unknown>,
  signingSecret: string,
): Promise<{ status: number }> {
  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: buildSignedHeaders(body, signingSecret),
    body,
  });
  return { status: response.status };
}

export const replayCommand = new Command()
  .description('Replay stored webhook events')
  .arguments('[event-id:string]')
  .option('--forward-to <url:string>', 'POST event(s) to a local URL')
  .option('--all', 'Replay all stored events')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ReplayOptions, eventId?: string) => {
    try {
      if (!eventId && !options.all) {
        console.error(
          'Provide an event ID or use --all to replay all stored events.',
        );
        process.exit(1);
      }

      if (eventId && options.all) {
        console.error('Cannot use both an event ID and --all.');
        process.exit(1);
      }

      const env = await getCurrentEnvironment();
      if (!env) {
        console.error("Not logged in. Please run 'mux login' to authenticate.");
        process.exit(1);
      }
      const environmentId = env.environment.environmentId ?? env.name;

      // Use provided --forward-to, or fall back to the saved URL
      if (!options.forwardTo && env.environment.forwardUrl) {
        options.forwardTo = env.environment.forwardUrl;
      }

      // Save the forward URL if a new one was provided
      if (
        options.forwardTo &&
        options.forwardTo !== env.environment.forwardUrl
      ) {
        await updateEnvironment(env.name, {
          forwardUrl: options.forwardTo,
        });
      }

      if (options.all) {
        const events = getAllEvents(environmentId);
        if (events.length === 0) {
          console.log('No stored events to replay.');
          return;
        }

        if (!options.forwardTo) {
          if (options.json) {
            console.log(JSON.stringify(events, null, 2));
          } else {
            for (const event of events) {
              console.log(JSON.stringify(event.payload, null, 2));
            }
          }
          return;
        }

        const signingSecret = await getSigningSecretForCurrentEnv();

        let forwarded = 0;
        let failed = 0;
        for (const event of events) {
          try {
            const { status } = await forwardEvent(
              options.forwardTo,
              event.payload,
              signingSecret,
            );
            if (status >= 200 && status < 300) {
              forwarded++;
              if (!options.json) {
                console.log(
                  `${colors.green(`[${status}]`)}  ${event.type.padEnd(30)}  ${event.id}`,
                );
              }
            } else {
              failed++;
              if (!options.json) {
                console.log(
                  `${colors.red(`[${status}]`)}  ${event.type.padEnd(30)}  ${event.id}`,
                );
              }
            }
          } catch {
            failed++;
            if (!options.json) {
              console.log(
                `${colors.red('[ERR]')}  ${event.type.padEnd(30)}  ${event.id}`,
              );
            }
          }
        }

        if (options.json) {
          console.log(JSON.stringify({ forwarded, failed }, null, 2));
        } else {
          console.log(
            `\nReplayed ${forwarded + failed} events: ${forwarded} forwarded, ${failed} failed.`,
          );
        }
        return;
      }

      // Single event replay
      const event = getEventById(eventId as string, environmentId);
      if (!event) {
        console.error(`Event not found: ${eventId}`);
        process.exit(1);
      }

      if (!options.forwardTo) {
        console.log(JSON.stringify(event.payload, null, 2));
        return;
      }

      const signingSecret = await getSigningSecretForCurrentEnv();
      const { status } = await forwardEvent(
        options.forwardTo,
        event.payload,
        signingSecret,
      );
      if (options.json) {
        console.log(JSON.stringify({ status, eventId: event.id }, null, 2));
      } else if (status >= 200 && status < 300) {
        console.log(
          `${colors.green(`[${status}]`)} Forwarded ${event.type} (${event.id}) to ${options.forwardTo}`,
        );
      } else {
        console.log(
          `${colors.red(`[${status}]`)} Failed to forward ${event.type} (${event.id}) to ${options.forwardTo}`,
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
