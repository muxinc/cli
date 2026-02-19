import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface RelatedOptions {
  orderBy?: string;
  orderDirection?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const relatedCommand = new Command()
  .description('List related incidents')
  .arguments('<incident-id:string>')
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
  .option('--limit <limit:number>', 'Number of results per page', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Compact output format (one line per incident)')
  .action(async (options: RelatedOptions, incidentId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
      };

      if (options.orderBy) {
        params.order_by = options.orderBy;
      }
      if (options.orderDirection) {
        params.order_direction = options.orderDirection;
      }

      const response = await mux.data.incidents.listRelated(
        incidentId,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No related incidents found.');
        return;
      }

      if (options.compact) {
        for (const incident of data) {
          console.log(
            `${incident.id}\t${incident.severity ?? '-'}\t${incident.status ?? '-'}\t${incident.description ?? '-'}`,
          );
        }
      } else {
        for (const incident of data) {
          console.log(`Incident ID: ${incident.id}`);
          console.log(`  Severity: ${incident.severity ?? '-'}`);
          console.log(`  Status: ${incident.status ?? '-'}`);
          console.log(`  Description: ${incident.description ?? '-'}`);
          console.log(`  Impact: ${incident.impact ?? '-'}`);
          console.log(`  Started At: ${incident.started_at ?? '-'}`);
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
