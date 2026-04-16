import { Command } from '@cliffy/command';
import type {
  ModerateCreateParams,
  ModerateJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  assertJobCompleted,
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

interface ModerateOptions {
  languageCode?: string;
  samplingInterval?: number;
  maxSamples?: number;
  thresholdSexual?: number;
  thresholdViolence?: number;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

function threshold(label: string) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new Error(
        `--${label} must be a number between 0 and 1 (got: ${value})`,
      );
    }
    return n;
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const moderateCommand: Command<any> = new Command()
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
    {
      value: (value: number): number => {
        if (value < 5) {
          throw new Error(
            `--sampling-interval minimum is 5 seconds (got: ${value})`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--max-samples <maxSamples:number>',
    'Maximum number of thumbnails to sample',
  )
  .option(
    '--threshold-sexual <thresholdSexual:string>',
    'Score threshold (0.0-1.0) for sexual content (default 0.7)',
    { value: threshold('threshold-sexual') },
  )
  .option(
    '--threshold-violence <thresholdViolence:string>',
    'Score threshold (0.0-1.0) for violent content (default 0.8)',
    { value: threshold('threshold-violence') },
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (thresholds, sampling_interval, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ModerateOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.languageCode !== undefined ||
        options.samplingInterval !== undefined ||
        options.maxSamples !== undefined ||
        options.thresholdSexual !== undefined ||
        options.thresholdViolence !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: ModerateJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<ModerateJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
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
      }

      const body: ModerateCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robotsPreview.jobs.moderate.create(body);

      if (!options.json) {
        console.log('Moderate job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'moderate',
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
      await handleCommandError(error, 'robots', 'moderate', options);
    }
  });
