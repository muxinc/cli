import { Command } from '@cliffy/command';
import type {
  ModerateCreateParams,
  ModerateJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface ModerateOptions {
  languageCode?: string;
  samplingInterval?: number;
  maxSamples?: number;
  thresholdSexual?: number;
  thresholdViolence?: number;
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
    'BCP 47 language code for transcript analysis (audio-only assets)',
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
    '--threshold-sexual <thresholdSexual:number>',
    'Score threshold (0.0-1.0) for sexual content (default 0.7)',
  )
  .option(
    '--threshold-violence <thresholdViolence:number>',
    'Score threshold (0.0-1.0) for violent content (default 0.8)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ModerateOptions, assetId: string) => {
    try {
      const parameters: ModerateJobParameters = { asset_id: assetId };
      if (options.languageCode !== undefined)
        parameters.language_code = options.languageCode;
      if (options.samplingInterval !== undefined)
        parameters.sampling_interval = options.samplingInterval;
      if (options.maxSamples !== undefined)
        parameters.max_samples = options.maxSamples;
      if (
        options.thresholdSexual !== undefined ||
        options.thresholdViolence !== undefined
      ) {
        parameters.thresholds = {};
        if (options.thresholdSexual !== undefined)
          parameters.thresholds.sexual = options.thresholdSexual;
        if (options.thresholdViolence !== undefined)
          parameters.thresholds.violence = options.thresholdViolence;
      }

      const body: ModerateCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robotsPreview.jobs.moderate.create(body);

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Moderate job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'moderate', options);
    }
  });
