import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ValuesOptions {
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const valuesCommand = new Command()
  .description('List values for a specific dimension')
  .arguments('<dimension-id:string>')
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
  .option('--limit <limit:number>', 'Number of results per page', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Compact output format (one line per value)')
  .action(async (options: ValuesOptions, dimensionId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const filterParams = buildDataFilterParams(options);
      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
        ...filterParams,
      };

      const response = await mux.data.dimensions.listValues(
        dimensionId,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log(`No values found for dimension "${dimensionId}".`);
        return;
      }

      if (options.compact) {
        for (const item of data) {
          console.log(`${item.value ?? '-'}\t${item.total_count ?? 0}`);
        }
      } else {
        for (const item of data) {
          console.log(`Value: ${item.value ?? '-'}`);
          console.log(`  Total Count: ${item.total_count ?? 0}`);
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
