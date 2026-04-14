import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { formatCreatedAt } from '@/lib/formatters.ts';
import { listJobs } from '@/lib/robots.ts';

interface ListOptions {
  workflow?: string;
  status?: string;
  assetId?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List Mux Robots jobs')
  .option(
    '--workflow <workflow:string>',
    'Filter by workflow type (summarize, moderate, generate-chapters, translate-captions, ask-questions, find-key-moments)',
  )
  .option('--status <status:string>', 'Filter by job status')
  .option('--asset-id <assetId:string>', 'Filter by asset ID')
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per job (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const result = await listJobs({
        workflow: options.workflow,
        status: options.status,
        assetId: options.assetId,
        limit: options.limit,
        page: options.page,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const data = result.data ?? [];

      if (data.length === 0) {
        console.log('No jobs found.');
        return;
      }

      if (options.compact) {
        for (const job of data) {
          console.log(`${job.id}\t${job.workflow}\t${job.status}`);
        }
      } else {
        for (const job of data) {
          console.log(`Job ID: ${job.id}`);
          console.log(`  Workflow: ${job.workflow}`);
          console.log(`  Status: ${job.status}`);
          if (job.created_at !== undefined) {
            console.log(
              `  Created: ${formatCreatedAt(String(job.created_at))}`,
            );
          }
          console.log('');
        }
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'list', options);
    }
  });
