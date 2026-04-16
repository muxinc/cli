import { Command } from '@cliffy/command';
import type { JobListParams } from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { formatCreatedAt } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

type JobWorkflow = NonNullable<JobListParams['workflow']>;
type JobStatus = NonNullable<JobListParams['status']>;

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
      const mux = await createAuthenticatedMuxClient();

      const params: JobListParams = {
        limit: options.limit,
        page: options.page,
      };
      if (options.workflow) params.workflow = options.workflow as JobWorkflow;
      if (options.status) params.status = options.status as JobStatus;
      if (options.assetId) params.asset_id = options.assetId;

      const response = await mux.robotsPreview.jobs.list(params);
      const data = response.data ?? [];

      if (options.json) {
        console.log(JSON.stringify({ data }, null, 2));
        return;
      }

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
          console.log(`  Created: ${formatCreatedAt(String(job.created_at))}`);
          console.log('');
        }
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'list', options);
    }
  });
