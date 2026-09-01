import { Command } from '@cliffy/command';
import type {
  FindKeyMomentCreateParams,
  FindKeyMomentsJobParameters,
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

interface FindKeyMomentsOptions {
  maxMoments?: number;
  targetDurationMinMs?: number;
  targetDurationMaxMs?: number;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const findKeyMomentsCommand: Command<any> = new Command()
  .description('Create a job to find key moments and highlights in a video')
  .arguments('<asset-id:string>')
  .option(
    '--max-moments <maxMoments:number>',
    'Maximum number of key moments to extract (1-10, default 5)',
    {
      value: (value: number): number => {
        if (!Number.isInteger(value) || value < 1 || value > 10) {
          throw new Error(
            `--max-moments must be an integer between 1 and 10 (got: ${value})`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--target-duration-min-ms <targetDurationMinMs:number>',
    'Preferred minimum highlight duration in milliseconds. Must be paired with --target-duration-max-ms.',
  )
  .option(
    '--target-duration-max-ms <targetDurationMaxMs:number>',
    'Preferred maximum highlight duration in milliseconds. Must be paired with --target-duration-min-ms.',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (max_moments, target_duration_ms, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: FindKeyMomentsOptions, assetId: string) => {
    try {
      const minMs = options.targetDurationMinMs;
      const maxMs = options.targetDurationMaxMs;

      const hasShapeFlags =
        options.maxMoments !== undefined ||
        minMs !== undefined ||
        maxMs !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      if ((minMs === undefined) !== (maxMs === undefined)) {
        throw new Error(
          '--target-duration-min-ms and --target-duration-max-ms must be provided together.',
        );
      }

      let parameters: FindKeyMomentsJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<FindKeyMomentsJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.maxMoments !== undefined)
          parameters.max_moments = options.maxMoments;
        if (minMs !== undefined && maxMs !== undefined) {
          parameters.target_duration_ms = { min: minMs, max: maxMs };
        }
      }

      const body: FindKeyMomentCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.findKeyMoments.create(body);

      if (!wantsJson(options)) {
        console.log('Find key moments job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'find-key-moments', job.id, {
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
      await handleCommandError(error, 'robots', 'find-key-moments', options);
    }
  });
