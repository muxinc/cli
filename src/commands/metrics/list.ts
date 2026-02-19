import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  dimension?: string;
  value?: string;
  json?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const listCommand = new Command()
  .description('List available metrics and their values')
  .option(
    '--filters <filter:string>',
    'Filter results (e.g., "country:US"). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--metric-filters <filter:string>',
    'Filter by metric value (e.g., "aggregate_startup_time>=1000"). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix timestamps or duration (e.g., "24:hours"). Can be specified multiple times.',
    { collect: true },
  )
  .option('--dimension <dimension:string>', 'Filter by dimension')
  .option('--value <value:string>', 'Filter by value')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        ...buildDataFilterParams(options),
      };

      if (options.dimension) {
        params.dimension = options.dimension;
      }
      if (options.value) {
        params.value = options.value;
      }

      const response = await mux.data.metrics.list(params as never);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No metrics found.');
        return;
      }

      for (const metric of data) {
        console.log(`${metric.name}: ${metric.value}`);
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
