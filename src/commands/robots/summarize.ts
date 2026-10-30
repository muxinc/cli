import { Command } from '@cliffy/command';
import type {
  SummarizeCreateParams,
  SummarizeJobParameters,
} from '@mux/ts/resources/robots/jobs';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  assertJobCompleted,
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
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (tone, output_steering, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: SummarizeOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.tone !== undefined ||
        options.languageCode !== undefined ||
        options.outputLanguageCode !== undefined ||
        options.titleLength !== undefined ||
        options.descriptionLength !== undefined ||
        options.tagCount !== undefined;

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
      }

      const body: SummarizeCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.summarize.create(body);

      if (!wantsJson(options)) {
        console.log('Summarize job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'summarize', job.id, {
          json: wantsJson(options),
        })) as typeof job;
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(job, null, 2));
      } else if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }

      if (options.wait) assertJobCompleted(job);
    } catch (error) {
      await handleCommandError(error, 'robots', 'summarize', options);
    }
  });
