import { Command } from '@cliffy/command';
import type {
  SummarizeCreateParams,
  SummarizeJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

type Tone = NonNullable<SummarizeJobParameters['tone']>;
const VALID_TONES: Tone[] = ['neutral', 'playful', 'professional'];

interface SummarizeOptions {
  tone?: Tone;
  languageCode?: string;
  outputLanguageCode?: string;
  titleLength?: number;
  descriptionLength?: number;
  tagCount?: number;
  promptTask?: string;
  promptTitle?: string;
  promptDescription?: string;
  promptKeywords?: string;
  promptQualityGuidelines?: string;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const summarizeCommand: Command<any> = new Command()
  .description(
    'Create a summarize job to generate a title, description, and tags for a video',
  )
  .arguments('<asset-id:string>')
  .option(
    '--tone <tone:string>',
    'Tone of the summary (neutral, playful, professional)',
    {
      value: (value: string): Tone => {
        if (!VALID_TONES.includes(value as Tone)) {
          throw new Error(
            `Invalid --tone: ${value}. Must be one of: ${VALID_TONES.join(', ')}`,
          );
        }
        return value as Tone;
      },
    },
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
    '--prompt-task <promptTask:string>',
    'Override the core task instruction for summarization',
  )
  .option(
    '--prompt-title <promptTitle:string>',
    'Override the title generation requirements',
  )
  .option(
    '--prompt-description <promptDescription:string>',
    'Override the description generation requirements',
  )
  .option(
    '--prompt-keywords <promptKeywords:string>',
    'Override the keyword/tag extraction requirements',
  )
  .option(
    '--prompt-quality-guidelines <promptQualityGuidelines:string>',
    'Override the quality standards for analysis',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (tone, prompt_overrides, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: SummarizeOptions, assetId: string) => {
    try {
      const promptOverrides = buildPromptOverrides(options);
      const hasShapeFlags =
        options.tone !== undefined ||
        options.languageCode !== undefined ||
        options.outputLanguageCode !== undefined ||
        options.titleLength !== undefined ||
        options.descriptionLength !== undefined ||
        options.tagCount !== undefined ||
        promptOverrides !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: SummarizeJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<SummarizeJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.tone !== undefined) parameters.tone = options.tone;
        if (options.languageCode !== undefined)
          parameters.language_code = options.languageCode;
        if (options.outputLanguageCode !== undefined)
          parameters.output_language_code = options.outputLanguageCode;
        if (options.titleLength !== undefined)
          parameters.title_length = options.titleLength;
        if (options.descriptionLength !== undefined)
          parameters.description_length = options.descriptionLength;
        if (options.tagCount !== undefined)
          parameters.tag_count = options.tagCount;
        if (promptOverrides !== undefined)
          parameters.prompt_overrides = promptOverrides;
      }

      const body: SummarizeCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robotsPreview.jobs.summarize.create(body);

      if (!options.json) {
        console.log('Summarize job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'summarize',
          job.id,
          Boolean(options.json),
        )) as typeof job;
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'summarize', options);
    }
  });

function buildPromptOverrides(
  options: SummarizeOptions,
): SummarizeJobParameters.PromptOverrides | undefined {
  const overrides: SummarizeJobParameters.PromptOverrides = {};
  if (options.promptTask !== undefined) overrides.task = options.promptTask;
  if (options.promptTitle !== undefined) overrides.title = options.promptTitle;
  if (options.promptDescription !== undefined)
    overrides.description = options.promptDescription;
  if (options.promptKeywords !== undefined)
    overrides.keywords = options.promptKeywords;
  if (options.promptQualityGuidelines !== undefined)
    overrides.quality_guidelines = options.promptQualityGuidelines;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
