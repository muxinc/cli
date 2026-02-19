import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific playback restriction')
  .arguments('<restriction-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, restrictionId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const restriction =
        await mux.video.playbackRestrictions.retrieve(restrictionId);

      if (options.json) {
        console.log(JSON.stringify(restriction, null, 2));
      } else {
        console.log(`Restriction ID: ${restriction.id}`);
        console.log(`Created: ${restriction.created_at}`);
        if (restriction.referrer?.allowed_domains) {
          console.log(
            `Allowed Domains: ${restriction.referrer.allowed_domains.join(', ')}`,
          );
        }
        if (restriction.referrer?.allow_no_referrer) {
          console.log('Allow No Referrer: true');
        }
        if (restriction.user_agent?.allow_no_user_agent) {
          console.log('Allow No User Agent: true');
        }
        if (restriction.user_agent?.allow_high_risk_user_agent) {
          console.log('Allow High Risk User Agent: true');
        }
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
