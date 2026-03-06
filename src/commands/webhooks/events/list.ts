import { Command } from '@cliffy/command';
import { getCurrentEnvironment } from '@/lib/config.ts';
import { listEvents } from '@/lib/events-store.ts';

interface ListOptions {
  limit?: number;
  json?: boolean;
}

export const listCommand = new Command()
  .description('List locally stored webhook events for the current environment')
  .option('--limit <limit:number>', 'Maximum number of events to show', {
    default: 25,
  })
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      const env = await getCurrentEnvironment();
      if (!env) {
        console.error("Not logged in. Please run 'mux login' to authenticate.");
        process.exit(1);
      }
      const environmentId = env.environment.environmentId ?? env.name;
      const events = listEvents(environmentId, options.limit);

      if (events.length === 0) {
        if (options.json) {
          console.log(JSON.stringify([], null, 2));
        } else {
          console.log(
            'No stored events. Run `mux webhooks listen` to capture events.',
          );
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(events, null, 2));
        return;
      }

      for (const event of events) {
        const time = new Date(event.timestamp).toLocaleTimeString();
        console.log(`[${time}]  ${event.type.padEnd(30)}  ${event.id}`);
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
