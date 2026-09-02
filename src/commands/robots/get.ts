import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { formatCreatedAt } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { type RobotsWorkflow, retrieveRobotsJob } from './_shared.ts';

const WORKFLOWS: RobotsWorkflow[] = [
  'ask-questions',
  'edit-captions',
  'find-best-thumbnails',
  'find-key-moments',
  'find-scenes',
  'generate-chapters',
  'generate-engagement-insights',
  'generate-premium-captions',
  'moderate',
  'summarize',
  'translate-audio',
  'translate-captions',
];

interface GetOptions {
  workflow: string;
  json?: boolean;
}

function assertWorkflow(workflow: string): RobotsWorkflow {
  if (!WORKFLOWS.includes(workflow as RobotsWorkflow)) {
    throw new Error(
      `Unknown workflow: ${workflow}. Must be one of: ${WORKFLOWS.join(', ')}.`,
    );
  }
  return workflow as RobotsWorkflow;
}

export const getCommand = new Command()
  .description('Get details about a specific Mux Robots job')
  .arguments('<job-id:string>')
  .option(
    '--workflow <workflow:string>',
    `Workflow type (${WORKFLOWS.join(', ')})`,
    { required: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, jobId: string) => {
    try {
      const workflow = assertWorkflow(options.workflow);
      const mux = await createAuthenticatedMuxClient();
      const job = await retrieveRobotsJob(mux, workflow, jobId);

      if (wantsJson(options)) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log(`Job ID: ${job.id}`);
      console.log(`Workflow: ${job.workflow}`);
      console.log(`Status: ${job.status}`);
      console.log(`Units consumed: ${job.units_consumed}`);
      console.log(`Created: ${formatCreatedAt(String(job.created_at))}`);
      console.log(`Updated: ${formatCreatedAt(String(job.updated_at))}`);
      if (job.passthrough) {
        console.log(`Passthrough: ${job.passthrough}`);
      }

      console.log('Parameters:');
      for (const [key, value] of Object.entries(job.parameters)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
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
