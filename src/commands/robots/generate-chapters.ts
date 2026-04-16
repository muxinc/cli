import { Command } from '@cliffy/command';
import type {
  GenerateChapterCreateParams,
  GenerateChaptersJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface GenerateChaptersOptions {
  languageCode?: string;
  outputLanguageCode?: string;
  passthrough?: string;
  json?: boolean;
}

export const generateChaptersCommand = new Command()
  .description('Create a job to automatically generate chapters for a video')
  .arguments('<asset-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--output-language-code <outputLanguageCode:string>',
    'BCP 47 language code for the output chapter titles',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GenerateChaptersOptions, assetId: string) => {
    try {
      const parameters: GenerateChaptersJobParameters = { asset_id: assetId };
      if (options.languageCode !== undefined)
        parameters.language_code = options.languageCode;
      if (options.outputLanguageCode !== undefined)
        parameters.output_language_code = options.outputLanguageCode;

      const body: GenerateChapterCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robotsPreview.jobs.generateChapters.create(body);

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Generate chapters job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'generate-chapters', options);
    }
  });
