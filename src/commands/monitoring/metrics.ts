import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface MetricsListOptions {
  json?: boolean;
}

export const metricsListCommand = new Command()
  .description('List available monitoring metrics')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: MetricsListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const response = await mux.data.monitoring.metrics.list();

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No monitoring metrics found.');
        return;
      }

      for (const metric of data) {
        console.log(`${metric.name}: ${metric.display_name}`);
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
