import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

interface ModerateOptions {
  languageCode?: string;
  samplingInterval?: number;
  maxSamples?: number;
  passthrough?: string;
  json?: boolean;
}

export const moderateCommand = new Command()
  .description(
    'Create a moderation job to analyze video content for policy violations',
  )
  .arguments('<asset-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code for transcript analysis',
  )
  .option(
    '--sampling-interval <samplingInterval:number>',
    'Interval in seconds between sampled thumbnails (min 5)',
  )
  .option(
    '--max-samples <maxSamples:number>',
    'Maximum number of thumbnails to sample',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ModerateOptions, assetId: string) => {
    try {
      const params: Record<string, unknown> = { asset_id: assetId };
      if (options.languageCode !== undefined)
        params.language_code = options.languageCode;
      if (options.samplingInterval !== undefined)
        params.sampling_interval = options.samplingInterval;
      if (options.maxSamples !== undefined)
        params.max_samples = options.maxSamples;

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('moderate', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Moderate job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'moderate', options);
    }
  });
