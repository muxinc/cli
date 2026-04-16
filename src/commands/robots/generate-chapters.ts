import { Command } from '@cliffy/command';
import type {
  GenerateChapterCreateParams,
  GenerateChaptersJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  assertJobCompleted,
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

interface GenerateChaptersOptions {
  languageCode?: string;
  outputLanguageCode?: string;
  promptTask?: string;
  promptOutputFormat?: string;
  promptChapterGuidelines?: string;
  promptTitleGuidelines?: string;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const generateChaptersCommand: Command<any> = new Command()
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
    '--prompt-task <promptTask:string>',
    'Override the core task instruction for chapter generation',
  )
  .option(
    '--prompt-output-format <promptOutputFormat:string>',
    'Override the JSON output format instructions',
  )
  .option(
    '--prompt-chapter-guidelines <promptChapterGuidelines:string>',
    'Override the chapter density and timing constraints',
  )
  .option(
    '--prompt-title-guidelines <promptTitleGuidelines:string>',
    'Override the chapter title style requirements',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (language_code, prompt_overrides, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GenerateChaptersOptions, assetId: string) => {
    try {
      const promptOverrides = buildPromptOverrides(options);
      const hasShapeFlags =
        options.languageCode !== undefined ||
        options.outputLanguageCode !== undefined ||
        promptOverrides !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: GenerateChaptersJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<GenerateChaptersJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.languageCode !== undefined)
          parameters.language_code = options.languageCode;
        if (options.outputLanguageCode !== undefined)
          parameters.output_language_code = options.outputLanguageCode;
        if (promptOverrides !== undefined)
          parameters.prompt_overrides = promptOverrides;
      }

      const body: GenerateChapterCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robotsPreview.jobs.generateChapters.create(body);

      if (!options.json) {
        console.log('Generate chapters job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'generate-chapters',
          job.id,
          Boolean(options.json),
        )) as typeof job;
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
      } else if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }

      if (options.wait) assertJobCompleted(job);
    } catch (error) {
      await handleCommandError(error, 'robots', 'generate-chapters', options);
    }
  });

function buildPromptOverrides(
  options: GenerateChaptersOptions,
): GenerateChaptersJobParameters.PromptOverrides | undefined {
  const overrides: GenerateChaptersJobParameters.PromptOverrides = {};
  if (options.promptTask !== undefined) overrides.task = options.promptTask;
  if (options.promptOutputFormat !== undefined)
    overrides.output_format = options.promptOutputFormat;
  if (options.promptChapterGuidelines !== undefined)
    overrides.chapter_guidelines = options.promptChapterGuidelines;
  if (options.promptTitleGuidelines !== undefined)
    overrides.title_guidelines = options.promptTitleGuidelines;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
