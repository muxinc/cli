import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface TimeseriesOptions {
  timestamp?: number;
  json?: boolean;
  filters?: string[];
}

export const timeseriesCommand = new Command()
  .description('Get monitoring timeseries for a metric')
  .arguments('<metric-id:string>')
  .option('--timestamp <timestamp:number>', 'Unix timestamp for the timeseries')
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--filters <filter:string>',
    'Filter results (e.g., "country:US"). Can be specified multiple times.',
    { collect: true },
  )
  .action(async (options: TimeseriesOptions, metricId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {};

      if (options.timestamp !== undefined) {
        params.timestamp = options.timestamp;
      }
      if (options.filters && options.filters.length > 0) {
        params.filters = options.filters;
      }

      const response = await mux.data.monitoring.metrics.getTimeseries(
        metricId as never,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No timeseries data found.');
        return;
      }

      for (const point of data) {
        console.log(
          `Date: ${point.date ?? '-'}  Value: ${point.value ?? '-'}  Concurrent Viewers: ${point.concurrent_viewers ?? '-'}`,
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
