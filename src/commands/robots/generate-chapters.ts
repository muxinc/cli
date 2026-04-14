import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

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
      const params: Record<string, unknown> = { asset_id: assetId };
      if (options.languageCode !== undefined)
        params.language_code = options.languageCode;
      if (options.outputLanguageCode !== undefined)
        params.output_language_code = options.outputLanguageCode;

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('generate-chapters', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Generate chapters job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'generate-chapters', options);
    }
  });
