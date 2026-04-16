import { Command } from '@cliffy/command';
import type {
  FindKeyMomentCreateParams,
  FindKeyMomentsJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface FindKeyMomentsOptions {
  maxMoments?: number;
  targetDurationMinMs?: number;
  targetDurationMaxMs?: number;
  passthrough?: string;
  json?: boolean;
}

export const findKeyMomentsCommand = new Command()
  .description('Create a job to find key moments and highlights in a video')
  .arguments('<asset-id:string>')
  .option(
    '--max-moments <maxMoments:number>',
    'Maximum number of key moments to extract (default 5)',
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
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: FindKeyMomentsOptions, assetId: string) => {
    try {
      const minMs = options.targetDurationMinMs;
      const maxMs = options.targetDurationMaxMs;
      if ((minMs === undefined) !== (maxMs === undefined)) {
        throw new Error(
          '--target-duration-min-ms and --target-duration-max-ms must be provided together.',
        );
      }

      const parameters: FindKeyMomentsJobParameters = { asset_id: assetId };
      if (options.maxMoments !== undefined)
        parameters.max_moments = options.maxMoments;
      if (minMs !== undefined && maxMs !== undefined) {
        parameters.target_duration_ms = { min: minMs, max: maxMs };
      }

      const body: FindKeyMomentCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robotsPreview.jobs.findKeyMoments.create(body);

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log('Find key moments job created');
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'find-key-moments', options);
    }
  });
