import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { updateEnvironment } from '@/lib/config.ts';
import { wantsJson } from '@/lib/context.ts';
import { getEventById, getRecentEvents } from '@/lib/events-store.ts';
import { resolveActiveEnvironment } from '@/lib/mux.ts';
import { buildSignedHeaders, getSigningSecret } from '@/lib/webhook-signing.ts';

interface ReplayOptions {
  forwardTo?: string;
  count?: number;
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
  .option('--count <n:integer>', 'Replay the last N events')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ReplayOptions, eventId?: string) => {
    try {
      if (!eventId && !options.count) {
        console.error(
          'Provide an event ID or use --count <n> to replay the last N events.',
        );
        process.exit(1);
      }

      if (eventId && options.count) {
        console.error('Cannot use both an event ID and --count.');
        process.exit(1);
      }

      const active = await resolveActiveEnvironment();
      const environmentId = active.environmentId;
      const signingSecretKey = active.stored?.name ?? active.environmentId;

      // Use provided --forward-to, or fall back to the saved URL
      if (!options.forwardTo && active.stored?.environment.forwardUrl) {
        options.forwardTo = active.stored.environment.forwardUrl;
      }

      // Save the forward URL if a new one was provided. Only persisted when
      // the stored environment matches the active credentials.
      if (
        options.forwardTo &&
        active.stored &&
        options.forwardTo !== active.stored.environment.forwardUrl
      ) {
        await updateEnvironment(active.stored.name, {
          forwardUrl: options.forwardTo,
        });
      }

      // Single event replay by ID
      if (eventId) {
        const event = getEventById(eventId, environmentId);
        if (!event) {
          console.error(`Event not found: ${eventId}`);
          process.exit(1);
        }

        if (!options.forwardTo) {
          console.log(JSON.stringify(event.payload, null, 2));
          return;
        }

        const signingSecret = await getSigningSecret(signingSecretKey);
        const { status } = await forwardEvent(
          options.forwardTo,
          event.payload,
          signingSecret,
        );
        if (wantsJson(options)) {
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
        return;
      }

      // Replay last N events
      const count = options.count as number;
      const events = getRecentEvents(environmentId, count);
      if (events.length === 0) {
        console.log('No stored events to replay.');
        return;
      }

      if (!options.forwardTo) {
        if (wantsJson(options)) {
          console.log(JSON.stringify(events, null, 2));
        } else {
          for (const event of events) {
            console.log(JSON.stringify(event.payload, null, 2));
          }
        }
        return;
      }

      const signingSecret = await getSigningSecret(signingSecretKey);

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
            if (!wantsJson(options)) {
              console.log(
                `${colors.green(`[${status}]`)}  ${event.type.padEnd(30)}  ${event.id}`,
              );
            }
          } else {
            failed++;
            if (!wantsJson(options)) {
              console.log(
                `${colors.red(`[${status}]`)}  ${event.type.padEnd(30)}  ${event.id}`,
              );
            }
          }
        } catch {
          failed++;
          if (!wantsJson(options)) {
            console.log(
              `${colors.red('[ERR]')}  ${event.type.padEnd(30)}  ${event.id}`,
            );
          }
        }
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify({ forwarded, failed }, null, 2));
      } else {
        console.log(
          `\nReplayed ${forwarded + failed} events: ${forwarded} forwarded, ${failed} failed.`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (wantsJson(options)) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
