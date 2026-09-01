import { Command } from '@cliffy/command';
import type {
  FindBestThumbnailCreateParams,
  FindBestThumbnailsJobParameters,
  FindBestThumbnailsOutputSteering,
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

interface FindBestThumbnailsOptions {
  maxThumbnails?: number;
  updateAssetThumbnail?: boolean;
  audience?: string;
  campaignStyle?: string;
  lookingFor?: string;
  startTime?: number;
  endTime?: number;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const findBestThumbnailsCommand: Command<any> = new Command()
  .description('Create a job to find the best thumbnail candidates for a video')
  .arguments('<asset-id:string>')
  .option(
    '--max-thumbnails <maxThumbnails:number>',
    'Maximum number of thumbnail candidates to return',
  )
  .option(
    '--update-asset-thumbnail',
    "Set the asset's default thumbnail time to the top candidate",
  )
  .option(
    '--audience <audience:string>',
    'Intended audience used as best-effort scoring guidance',
  )
  .option(
    '--campaign-style <campaignStyle:string>',
    'Description of the campaign/channel thumbnail style to prefer',
  )
  .option(
    '--looking-for <lookingFor:string>',
    'Description of what to look for in candidate thumbnails',
  )
  .option(
    '--start-time <startTime:number>',
    'Start of the execution window in seconds on the asset timeline',
  )
  .option(
    '--end-time <endTime:number>',
    'End of the execution window in seconds on the asset timeline',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (max_thumbnails, output_steering, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: FindBestThumbnailsOptions, assetId: string) => {
    try {
      const outputSteering = buildOutputSteering(options);
      const hasShapeFlags =
        options.maxThumbnails !== undefined ||
        options.updateAssetThumbnail !== undefined ||
        outputSteering !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: FindBestThumbnailsJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<FindBestThumbnailsJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.maxThumbnails !== undefined)
          parameters.max_thumbnails = options.maxThumbnails;
        if (options.updateAssetThumbnail !== undefined)
          parameters.update_asset_thumbnail = options.updateAssetThumbnail;
        if (outputSteering !== undefined)
          parameters.output_steering = outputSteering;
      }

      const body: FindBestThumbnailCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.findBestThumbnails.create(body);

      if (!wantsJson(options)) {
        console.log('Find best thumbnails job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'find-best-thumbnails', job.id, {
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
      await handleCommandError(
        error,
        'robots',
        'find-best-thumbnails',
        options,
      );
    }
  });

function buildOutputSteering(
  options: FindBestThumbnailsOptions,
): FindBestThumbnailsOutputSteering | undefined {
  const steering: FindBestThumbnailsOutputSteering = {};
  if (options.audience !== undefined) steering.audience = options.audience;
  if (options.campaignStyle !== undefined)
    steering.campaign_style = options.campaignStyle;
  if (options.lookingFor !== undefined)
    steering.looking_for = options.lookingFor;
  if (options.startTime !== undefined || options.endTime !== undefined) {
    steering.scope = {};
    if (options.startTime !== undefined)
      steering.scope.start_time = options.startTime;
    if (options.endTime !== undefined)
      steering.scope.end_time = options.endTime;
  }
  return Object.keys(steering).length > 0 ? steering : undefined;
}
