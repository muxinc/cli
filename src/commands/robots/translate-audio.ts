import { Command } from '@cliffy/command';
import type {
  TranslateAudioCreateParams,
  TranslateAudioJobParameters,
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

interface TranslateAudioOptions {
  toLanguageCode?: string;
  upload?: boolean;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const translateAudioCommand: Command<any> = new Command()
  .description(
    "Create a job to translate a video's audio track to another language",
  )
  .arguments('<asset-id:string>')
  .option(
    '--to-language-code <toLanguageCode:string>',
    'BCP 47 language code for the translated audio (e.g. "es", "ja")',
  )
  .option(
    '--no-upload',
    'Do not upload the translated audio track to Mux (default: uploads)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (to_language_code, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: TranslateAudioOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.toLanguageCode !== undefined || options.upload === false;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: TranslateAudioJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<TranslateAudioJobParameters>(
          options.file,
          assetId,
        );
      } else {
        if (!options.toLanguageCode) {
          throw new Error(
            '--to-language-code is required (or provide via --file)',
          );
        }
        parameters = {
          asset_id: assetId,
          to_language_code: options.toLanguageCode,
        };
        if (options.upload === false) {
          parameters.upload_to_mux = false;
        }
      }

      const body: TranslateAudioCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.translateAudio.create(body);

      if (!wantsJson(options)) {
        console.log('Translate audio job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'translate-audio', job.id, {
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
      await handleCommandError(error, 'robots', 'translate-audio', options);
    }
  });
