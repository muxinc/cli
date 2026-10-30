import { Command } from '@cliffy/command';
import type {
  GenerateChapterCreateParams,
  GenerateChaptersJobParameters,
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

interface GenerateChaptersOptions {
  languageCode?: string;
  outputLanguageCode?: string;
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
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (language_code, output_steering, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GenerateChaptersOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.languageCode !== undefined ||
        options.outputLanguageCode !== undefined;

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
      }

      const body: GenerateChapterCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.generateChapters.create(body);

      if (!wantsJson(options)) {
        console.log('Generate chapters job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'generate-chapters', job.id, {
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
      await handleCommandError(error, 'robots', 'generate-chapters', options);
    }
  });
