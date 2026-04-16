import { Command } from '@cliffy/command';
import type {
  TranslateCaptionCreateParams,
  TranslateCaptionsJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface TranslateCaptionsOptions {
  trackId: string;
  toLanguageCode: string;
  upload?: boolean;
  passthrough?: string;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const translateCaptionsCommand: Command<any> = new Command()
  .description(
    'Create a job to translate captions on a video to another language',
  )
  .arguments('<asset-id:string>')
  .option(
    '--track-id <trackId:string>',
    'Source caption track ID to translate',
    { required: true },
  )
  .option(
    '--to-language-code <toLanguageCode:string>',
    'BCP 47 language code for the translated output (e.g. "es", "ja")',
    { required: true },
  )
  .option(
    '--no-upload',
    'Do not upload the translated VTT to Mux (default: uploads)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: TranslateCaptionsOptions, assetId: string) => {
    try {
      const parameters: TranslateCaptionsJobParameters = {
        asset_id: assetId,
        track_id: options.trackId,
        to_language_code: options.toLanguageCode,
      };
      if (options.upload === false) {
        parameters.upload_to_mux = false;
      }

      const body: TranslateCaptionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robotsPreview.jobs.translateCaptions.create(body);

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Translate captions job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'translate-captions', options);
    }
  });
