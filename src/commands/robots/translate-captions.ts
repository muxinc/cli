import { Command } from '@cliffy/command';
import type {
  TranslateCaptionCreateParams,
  TranslateCaptionsJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

interface TranslateCaptionsOptions {
  trackId?: string;
  toLanguageCode?: string;
  upload?: boolean;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const translateCaptionsCommand: Command<any> = new Command()
  .description(
    'Create a job to translate captions on a video to another language',
  )
  .arguments('<asset-id:string>')
  .option('--track-id <trackId:string>', 'Source caption track ID to translate')
  .option(
    '--to-language-code <toLanguageCode:string>',
    'BCP 47 language code for the translated output (e.g. "es", "ja")',
  )
  .option(
    '--no-upload',
    'Do not upload the translated VTT to Mux (default: uploads)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (track_id, to_language_code, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: TranslateCaptionsOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.trackId !== undefined ||
        options.toLanguageCode !== undefined ||
        options.upload === false;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: TranslateCaptionsJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<TranslateCaptionsJobParameters>(
          options.file,
          assetId,
        );
      } else {
        if (!options.trackId) {
          throw new Error('--track-id is required (or provide via --file)');
        }
        if (!options.toLanguageCode) {
          throw new Error(
            '--to-language-code is required (or provide via --file)',
          );
        }
        parameters = {
          asset_id: assetId,
          track_id: options.trackId,
          to_language_code: options.toLanguageCode,
        };
        if (options.upload === false) {
          parameters.upload_to_mux = false;
        }
      }

      const body: TranslateCaptionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robotsPreview.jobs.translateCaptions.create(body);

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'translate-captions',
          job.id,
          Boolean(options.json),
        )) as typeof job;
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Translate captions job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
      if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'translate-captions', options);
    }
  });
