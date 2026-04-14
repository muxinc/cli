import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

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
      const questions = options.question.map((q) => ({ question: q }));
      const params: Record<string, unknown> = {
        asset_id: assetId,
        questions,
      };
      if (options.languageCode !== undefined)
        params.language_code = options.languageCode;

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('ask-questions', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Ask questions job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'ask-questions', options);
    }
  });
