import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

interface TranslateCaptionsOptions {
  trackId: string;
  toLanguageCode: string;
  noUpload?: boolean;
  passthrough?: string;
  json?: boolean;
}

export const translateCaptionsCommand = new Command()
  .description(
    'Create a job to translate captions on a video to another language',
  )
  .arguments('<asset-id:string>')
  .option(
    '--track-id <trackId:string>',
    'Source caption track ID to translate',
    {
      required: true,
    },
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
      const params: Record<string, unknown> = {
        asset_id: assetId,
        track_id: options.trackId,
        to_language_code: options.toLanguageCode,
      };
      if (options.noUpload) {
        params.upload_to_mux = false;
      }

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('translate-captions', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Translate captions job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'translate-captions', options);
    }
  });
