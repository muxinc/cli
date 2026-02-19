import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List DRM configurations')
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per configuration (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const configurations = await mux.video.drmConfigurations.list({
        limit: options.limit,
        page: options.page,
      });

      if (options.json) {
        console.log(JSON.stringify(configurations, null, 2));
        return;
      }

      const data = configurations.data ?? [];

      if (data.length === 0) {
        console.log('No DRM configurations found.');
        return;
      }

      if (options.compact) {
        for (const config of data) {
          console.log(config.id);
        }
      } else {
        for (const config of data) {
          console.log(`DRM Configuration ID: ${config.id}`);
          console.log('');
        }
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
