import { Command } from '@cliffy/command';
import { buildDataFilterParams } from '../../lib/data-filters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  viewerId?: string;
  errorId?: number;
  orderDirection?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}

export const listCommand = new Command()
  .description('List video views from Mux Data')
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
  .option('--viewer-id <viewerId:string>', 'Filter by viewer ID')
  .option('--error-id <errorId:number>', 'Filter by error ID')
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
  .option('--compact', 'Output one line per view (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
        ...buildDataFilterParams(options),
      };

      if (options.viewerId) {
        params.viewer_id = options.viewerId;
      }
      if (options.errorId !== undefined) {
        params.error_id = options.errorId;
      }
      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }

      const response = await mux.data.videoViews.list(params as never);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No video views found.');
        return;
      }

      if (options.compact) {
        for (const view of data) {
          console.log(
            `${view.id}\t${view.video_title ?? '-'}\t${view.watch_time ?? 0}ms`,
          );
        }
      } else {
        for (const view of data) {
          console.log(`View ID:     ${view.id}`);
          console.log(`Video Title: ${view.video_title ?? '-'}`);
          console.log(`Watch Time:  ${view.watch_time ?? 0}ms`);
          console.log(`Viewer OS:   ${view.viewer_os_family ?? '-'}`);
          console.log(`Country:     ${view.country_code ?? '-'}`);
          console.log(`View Start:  ${view.view_start ?? '-'}`);
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
