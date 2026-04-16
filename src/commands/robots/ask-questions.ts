import { Command } from '@cliffy/command';
import type {
  AskQuestionCreateParams,
  AskQuestionsJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface AskQuestionsOptions {
  question: string[];
  languageCode?: string;
  passthrough?: string;
  json?: boolean;
}

export const askQuestionsCommand = new Command()
  .description('Create a job to ask questions about a video and get answers')
  .arguments('<asset-id:string>')
  .option(
    '--question <question:string>',
    'Question to ask about the video. Can be specified multiple times.',
    { collect: true, required: true },
  )
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: AskQuestionsOptions, assetId: string) => {
    try {
      const parameters: AskQuestionsJobParameters = {
        asset_id: assetId,
        questions: options.question.map((q) => ({ question: q })),
      };
      if (options.languageCode !== undefined)
        parameters.language_code = options.languageCode;

      const body: AskQuestionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robotsPreview.jobs.askQuestions.create(body);

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Ask questions job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'ask-questions', options);
    }
  });
