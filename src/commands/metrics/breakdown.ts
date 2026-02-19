import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface BreakdownOptions {
  groupBy?: string;
  measurement?: string;
  orderBy?: string;
  orderDirection?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const breakdownCommand = new Command()
  .description('List breakdown values for a specific metric')
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
  .option('--group-by <groupBy:string>', 'Dimension to group results by')
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
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per breakdown value (grep-friendly)')
  .action(async (options: BreakdownOptions, metricId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
        ...buildDataFilterParams(options),
      };

      if (options.groupBy) {
        params.group_by = options.groupBy;
      }
      if (options.measurement) {
        params.measurement = options.measurement;
      }
      if (options.orderBy) {
        params.order_by = options.orderBy;
      }
      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }

      const response = await mux.data.metrics.listBreakdownValues(
        metricId as never,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No breakdown values found.');
        return;
      }

      if (options.compact) {
        for (const item of data) {
          console.log(
            `${item.field ?? '-'}\t${item.value ?? '-'}\t${item.views ?? 0}`,
          );
        }
      } else {
        for (const item of data) {
          console.log(`Field:           ${item.field ?? '-'}`);
          console.log(`Value:           ${item.value ?? '-'}`);
          console.log(`Views:           ${item.views ?? 0}`);
          console.log(`Negative Impact: ${item.negative_impact ?? '-'}`);
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
