import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

interface SummarizeOptions {
  tone?: string;
  languageCode?: string;
  outputLanguageCode?: string;
  titleLength?: number;
  descriptionLength?: number;
  tagCount?: number;
  passthrough?: string;
  json?: boolean;
}

export const summarizeCommand = new Command()
  .description(
    'Create a summarize job to generate a title, description, and tags for a video',
  )
  .arguments('<asset-id:string>')
  .option(
    '--tone <tone:string>',
    'Tone of the summary (neutral, playful, professional)',
  )
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--output-language-code <outputLanguageCode:string>',
    'BCP 47 language code for the generated output',
  )
  .option(
    '--title-length <titleLength:number>',
    'Maximum title length in words',
  )
  .option(
    '--description-length <descriptionLength:number>',
    'Maximum description length in words',
  )
  .option('--tag-count <tagCount:number>', 'Maximum number of tags to generate')
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: SummarizeOptions, assetId: string) => {
    try {
      const params: Record<string, unknown> = { asset_id: assetId };
      if (options.tone !== undefined) params.tone = options.tone;
      if (options.languageCode !== undefined)
        params.language_code = options.languageCode;
      if (options.outputLanguageCode !== undefined)
        params.output_language_code = options.outputLanguageCode;
      if (options.titleLength !== undefined)
        params.title_length = options.titleLength;
      if (options.descriptionLength !== undefined)
        params.description_length = options.descriptionLength;
      if (options.tagCount !== undefined) params.tag_count = options.tagCount;

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('summarize', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Summarize job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'summarize', options);
    }
  });
