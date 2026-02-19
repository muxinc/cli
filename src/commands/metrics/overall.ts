import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface OverallOptions {
  measurement?: string;
  json?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const overallCommand = new Command()
  .description('Get overall metric values')
  .arguments('<metric-id:string>')
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
  .option(
    '--measurement <measurement:string>',
    'Measurement type (95th, median, avg, count, sum)',
    {
      value: (value: string): string => {
        const valid = ['95th', 'median', 'avg', 'count', 'sum'];
        if (!valid.includes(value)) {
          throw new Error(
            `Invalid measurement: ${value}. Must be one of: ${valid.join(', ')}.`,
          );
        }
        return value;
      },
    },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: OverallOptions, metricId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        ...buildDataFilterParams(options),
      };

      if (options.measurement) {
        params.measurement = options.measurement;
      }

      const response = await mux.data.metrics.getOverallValues(
        metricId as never,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const overall = response.data;

      if (!overall) {
        console.log('No overall values found.');
        return;
      }

      console.log(`Value:            ${overall.value ?? '-'}`);
      console.log(`Global Value:     ${overall.global_value ?? '-'}`);
      console.log(`Total Views:      ${overall.total_views ?? '-'}`);
      console.log(`Total Watch Time: ${overall.total_watch_time ?? '-'}`);
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
