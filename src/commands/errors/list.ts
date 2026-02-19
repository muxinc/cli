import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  json?: boolean;
  compact?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const listCommand = new Command()
  .description('List errors from Mux Data')
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
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per error (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        ...buildDataFilterParams(options),
      };

      const response = await mux.data.errors.list(params as never);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No errors found.');
        return;
      }

      if (options.compact) {
        for (const err of data) {
          console.log(
            `${err.id ?? '-'}\t${err.code ?? '-'}\t${err.count ?? 0}\t${err.description ?? '-'}`,
          );
        }
      } else {
        for (const err of data) {
          console.log(`Error ID: ${err.id ?? '-'}`);
          console.log(`  Code: ${err.code ?? '-'}`);
          console.log(`  Count: ${err.count ?? 0}`);
          console.log(
            `  Percentage: ${err.percentage != null ? `${err.percentage}%` : '-'}`,
          );
          console.log(`  Description: ${err.description ?? '-'}`);
          console.log(`  Last Seen: ${err.last_seen ?? '-'}`);
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
