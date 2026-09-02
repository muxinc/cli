import { Command } from '@cliffy/command';
import type {
  FindSceneCreateParams,
  FindScenesJobParameters,
  FindScenesOutputSteering,
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

type NarrationDetail = NonNullable<
  FindScenesOutputSteering['narration_detail']
>;
const VALID_NARRATION_DETAILS: NarrationDetail[] = [
  'concise',
  'balanced',
  'detailed',
];

interface FindScenesOptions {
  languageCode?: string;
  minSceneDurationMs?: number;
  minScenes?: number;
  audience?: string;
  brandTerm?: string[];
  narrationDetail?: NarrationDetail;
  startTime?: number;
  endTime?: number;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const findScenesCommand: Command<any> = new Command()
  .description('Create a job to detect and describe the scenes in a video')
  .arguments('<asset-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--min-scene-duration-ms <minSceneDurationMs:number>',
    'Minimum scene duration in milliseconds',
  )
  .option('--min-scenes <minScenes:number>', 'Minimum number of scenes')
  .option(
    '--audience <audience:string>',
    'Intended audience used as best-effort model guidance',
  )
  .option(
    '--brand-term <brandTerm:string>',
    'Preferred brand or domain term to use when supported (repeatable)',
    { collect: true },
  )
  .option(
    '--narration-detail <narrationDetail:string>',
    'How much detail scene narratives should include (concise, balanced, detailed)',
    {
      value: (value: string): NarrationDetail => {
        if (!VALID_NARRATION_DETAILS.includes(value as NarrationDetail)) {
          throw new Error(
            `Invalid --narration-detail: ${value}. Must be one of: ${VALID_NARRATION_DETAILS.join(', ')}`,
          );
        }
        return value as NarrationDetail;
      },
    },
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
    'JSON config file with the full parameters object (min_scenes, output_steering, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: FindScenesOptions, assetId: string) => {
    try {
      const outputSteering = buildOutputSteering(options);
      const hasShapeFlags =
        options.languageCode !== undefined ||
        options.minSceneDurationMs !== undefined ||
        options.minScenes !== undefined ||
        outputSteering !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: FindScenesJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<FindScenesJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.languageCode !== undefined)
          parameters.language_code = options.languageCode;
        if (options.minSceneDurationMs !== undefined)
          parameters.min_scene_duration_ms = options.minSceneDurationMs;
        if (options.minScenes !== undefined)
          parameters.min_scenes = options.minScenes;
        if (outputSteering !== undefined)
          parameters.output_steering = outputSteering;
      }

      const body: FindSceneCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.findScenes.create(body);

      if (!wantsJson(options)) {
        console.log('Find scenes job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'find-scenes', job.id, {
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
      await handleCommandError(error, 'robots', 'find-scenes', options);
    }
  });

function buildOutputSteering(
  options: FindScenesOptions,
): FindScenesOutputSteering | undefined {
  const steering: FindScenesOutputSteering = {};
  if (options.audience !== undefined) steering.audience = options.audience;
  if (options.brandTerm !== undefined && options.brandTerm.length > 0)
    steering.brand_terms = options.brandTerm;
  if (options.narrationDetail !== undefined)
    steering.narration_detail = options.narrationDetail;
  if (options.startTime !== undefined || options.endTime !== undefined) {
    steering.scope = {};
    if (options.startTime !== undefined)
      steering.scope.start_time = options.startTime;
    if (options.endTime !== undefined)
      steering.scope.end_time = options.endTime;
  }
  return Object.keys(steering).length > 0 ? steering : undefined;
}
