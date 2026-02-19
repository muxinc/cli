import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateUserAgentOptions {
  allowNoUserAgent: boolean;
  allowHighRiskUserAgent: boolean;
  json?: boolean;
}

export const updateUserAgentCommand = new Command()
  .description('Update the user agent restriction for a playback restriction')
  .arguments('<restriction-id:string>')
  .option(
    '--allow-no-user-agent <val:boolean>',
    'Allow playback when no user agent is sent',
    { required: true },
  )
  .option(
    '--allow-high-risk-user-agent <val:boolean>',
    'Allow playback from high-risk user agents',
    { required: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateUserAgentOptions, restrictionId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const restriction = await mux.video.playbackRestrictions.updateUserAgent(
        restrictionId,
        {
          allow_no_user_agent: options.allowNoUserAgent,
          allow_high_risk_user_agent: options.allowHighRiskUserAgent,
        },
      );

      if (options.json) {
        console.log(JSON.stringify(restriction, null, 2));
      } else {
        console.log('User agent restriction updated successfully');
        console.log(`  ID: ${restriction.id}`);
        console.log(
          `  Allow No User Agent: ${restriction.user_agent?.allow_no_user_agent}`,
        );
        console.log(
          `  Allow High Risk User Agent: ${restriction.user_agent?.allow_high_risk_user_agent}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
