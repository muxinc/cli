import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface BreakdownOptions {
  dimension?: string;
  orderBy?: string;
  orderDirection?: string;
  timestamp?: number;
  json?: boolean;
  filters?: string[];
}

export const breakdownCommand = new Command()
  .description('Get monitoring breakdown for a metric')
  .arguments('<metric-id:string>')
  .option('--dimension <dimension:string>', 'Dimension to break down by')
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
  .option('--timestamp <timestamp:number>', 'Unix timestamp for the breakdown')
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--filters <filter:string>',
    'Filter results (e.g., "country:US"). Can be specified multiple times.',
    { collect: true },
  )
  .action(async (options: BreakdownOptions, metricId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {};

      if (options.dimension) {
        params.dimension = options.dimension;
      }
      if (options.orderBy) {
        params.order_by = options.orderBy;
      }
      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }
      if (options.timestamp !== undefined) {
        params.timestamp = options.timestamp;
      }
      if (options.filters && options.filters.length > 0) {
        params.filters = options.filters;
      }

      const response = await mux.data.monitoring.metrics.getBreakdown(
        metricId as never,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No breakdown data found.');
        return;
      }

      for (const item of data) {
        console.log(`Value:              ${item.value ?? '-'}`);
        console.log(`Metric Value:       ${item.metric_value ?? '-'}`);
        console.log(`Concurrent Viewers: ${item.concurrent_viewers ?? '-'}`);
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
