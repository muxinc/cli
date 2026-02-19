import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  orderDirection?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
  timeframe?: string[];
}

export const listCommand = new Command()
  .description('List annotations from Mux Data')
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
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix timestamps or duration (e.g., "24:hours"). Can be specified multiple times.',
    { collect: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per annotation (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
      };

      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }
      if (options.timeframe && options.timeframe.length > 0) {
        params.timeframe = options.timeframe;
      }

      const response = await mux.data.annotations.list(params as never);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No annotations found.');
        return;
      }

      if (options.compact) {
        for (const annotation of data) {
          console.log(
            `${annotation.id}\t${annotation.date ?? '-'}\t${annotation.note ?? '-'}`,
          );
        }
      } else {
        for (const annotation of data) {
          console.log(`Annotation ID: ${annotation.id}`);
          console.log(`  Date: ${annotation.date ?? '-'}`);
          console.log(`  Note: ${annotation.note ?? '-'}`);
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
