import { Command } from '@cliffy/command';
import type { GenerateEngagementInsightCreateParams } from '@mux/ts/resources/robots/jobs';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { assertJobCompleted, pollForRobotsJob } from './_shared.ts';

interface GenerateEngagementInsightsOptions {
  passthrough?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const generateEngagementInsightsCommand: Command<any> = new Command()
  .description(
    "Create a job to analyze a video's engagement data and generate insights",
  )
  .arguments('<asset-id:string>')
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (options: GenerateEngagementInsightsOptions, assetId: string) => {
      try {
        const body: GenerateEngagementInsightCreateParams = {
          parameters: { asset_id: assetId },
        };
        if (options.passthrough !== undefined)
          body.passthrough = options.passthrough;

        const mux = await createAuthenticatedMuxClient();
        let job = await mux.robots.jobs.generateEngagementInsights.create(body);

        if (!wantsJson(options)) {
          console.log('Generate engagement insights job created');
          console.log(`  Job ID: ${job.id}`);
          console.log(`  Status: ${job.status}`);
        }

        if (options.wait) {
          job = (await pollForRobotsJob(
            mux,
            'generate-engagement-insights',
            job.id,
            { json: wantsJson(options) },
          )) as typeof job;
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
          'generate-engagement-insights',
          options,
        );
      }
    },
  );
