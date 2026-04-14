import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { formatCreatedAt } from '@/lib/formatters.ts';
import { getJob } from '@/lib/robots.ts';

interface GetOptions {
  workflow: string;
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific Mux Robots job')
  .arguments('<job-id:string>')
  .option(
    '--workflow <workflow:string>',
    'Workflow type (summarize, moderate, generate-chapters, translate-captions, ask-questions, find-key-moments)',
    { required: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, jobId: string) => {
    try {
      const result = await getJob(options.workflow, jobId);
      const job = result.data;

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Job ID: ${job.id}`);
      console.log(`Workflow: ${job.workflow}`);
      console.log(`Status: ${job.status}`);
      if (job.units_consumed !== undefined) {
        console.log(`Units consumed: ${job.units_consumed}`);
      }
      if (job.created_at !== undefined) {
        console.log(`Created: ${formatCreatedAt(String(job.created_at))}`);
      }
      if (job.updated_at !== undefined) {
        console.log(`Updated: ${formatCreatedAt(String(job.updated_at))}`);
      }
      if (job.passthrough) {
        console.log(`Passthrough: ${job.passthrough}`);
      }

      if (job.parameters) {
        console.log('Parameters:');
        for (const [key, value] of Object.entries(job.parameters)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }

      if (job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }

      if (job.errors?.length) {
        console.log('Errors:');
        for (const err of job.errors) {
          console.log(`  ${err.type}: ${err.message}`);
        }
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'get', options);
    }
  });
