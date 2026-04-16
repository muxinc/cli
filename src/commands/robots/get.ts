import { Command } from '@cliffy/command';
import type Mux from '@mux/mux-node';
import type {
  AskQuestionsJob,
  FindKeyMomentsJob,
  GenerateChaptersJob,
  ModerateJob,
  SummarizeJob,
  TranslateCaptionsJob,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { formatCreatedAt } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

type AnyJob =
  | AskQuestionsJob
  | FindKeyMomentsJob
  | GenerateChaptersJob
  | ModerateJob
  | SummarizeJob
  | TranslateCaptionsJob;

type Workflow = AnyJob['workflow'];

interface GetOptions {
  workflow: string;
  json?: boolean;
}

function retrieveJob(
  mux: Mux,
  workflow: string,
  jobId: string,
): Promise<AnyJob> {
  switch (workflow as Workflow) {
    case 'ask-questions':
      return mux.robotsPreview.jobs.askQuestions.retrieve(jobId);
    case 'find-key-moments':
      return mux.robotsPreview.jobs.findKeyMoments.retrieve(jobId);
    case 'generate-chapters':
      return mux.robotsPreview.jobs.generateChapters.retrieve(jobId);
    case 'moderate':
      return mux.robotsPreview.jobs.moderate.retrieve(jobId);
    case 'summarize':
      return mux.robotsPreview.jobs.summarize.retrieve(jobId);
    case 'translate-captions':
      return mux.robotsPreview.jobs.translateCaptions.retrieve(jobId);
    default:
      throw new Error(
        `Unknown workflow: ${workflow}. Must be one of: ask-questions, find-key-moments, generate-chapters, moderate, summarize, translate-captions.`,
      );
  }
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
      const mux = await createAuthenticatedMuxClient();
      const job = await retrieveJob(mux, options.workflow, jobId);

      if (options.json) {
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
