import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface BreakdownTimeseriesOptions {
  dimension?: string;
  limit?: number;
  orderBy?: string;
  orderDirection?: string;
  json?: boolean;
  filters?: string[];
  timeframe?: string[];
}

export const breakdownTimeseriesCommand = new Command()
  .description('Get monitoring breakdown timeseries for a metric')
  .arguments('<metric-id:string>')
  .option('--dimension <dimension:string>', 'Dimension to break down by')
  .option('--limit <limit:number>', 'Number of results to return')
  .option('--order-by <orderBy:string>', 'Field to order results by')
  .option(
    '--order-direction <orderDirection:string>',
    'Order direction (asc or desc)',
    {
      value: (value: string): string => {
        if (value !== 'asc' && value !== 'desc') {
          throw new Error(
            `Invalid order direction: ${value}. Must be "asc" or "desc".`,
          );
        }
        return value;
      },
    },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--filters <filter:string>',
    'Filter results (e.g., "country:US"). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix epoch timestamps. Specify twice for start and end.',
    { collect: true },
  )
  .action(async (options: BreakdownTimeseriesOptions, metricId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {};

      if (options.dimension) {
        params.dimension = options.dimension;
      }
      if (options.limit !== undefined) {
        params.limit = options.limit;
      }
      if (options.orderBy) {
        params.order_by = options.orderBy;
      }
      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }
      if (options.filters && options.filters.length > 0) {
        params.filters = options.filters;
      }
      if (options.timeframe && options.timeframe.length > 0) {
        params.timeframe = options.timeframe;
      }

      const response = await mux.data.monitoring.metrics.getBreakdownTimeseries(
        metricId as never,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No breakdown timeseries data found.');
        return;
      }

      for (const point of data) {
        console.log(`Date:   ${point.date ?? '-'}`);
        console.log(`Values: ${JSON.stringify(point.values ?? [])}`);
        console.log('');
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
