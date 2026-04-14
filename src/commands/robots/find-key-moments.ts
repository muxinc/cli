import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { createJob } from '@/lib/robots.ts';

interface FindKeyMomentsOptions {
  maxMoments?: number;
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
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: FindKeyMomentsOptions, assetId: string) => {
    try {
      const params: Record<string, unknown> = { asset_id: assetId };
      if (options.maxMoments !== undefined)
        params.max_moments = options.maxMoments;

      const body: Record<string, unknown> = { parameters: params };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const result = await createJob('find-key-moments', body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Find key moments job created`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'find-key-moments', options);
    }
  });
