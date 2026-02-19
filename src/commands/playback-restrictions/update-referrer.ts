import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateReferrerOptions {
  allowedDomains: string[];
  allowNoReferrer?: boolean;
  json?: boolean;
}

export const updateReferrerCommand = new Command()
  .description('Update the referrer restriction for a playback restriction')
  .arguments('<restriction-id:string>')
  .option(
    '--allowed-domains <domain:string>',
    'Allowed referrer domains. Can be specified multiple times.',
    { collect: true, required: true },
  )
  .option('--allow-no-referrer', 'Allow playback when no referrer is sent')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateReferrerOptions, restrictionId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const domains = options.allowedDomains;

      const restriction = await mux.video.playbackRestrictions.updateReferrer(
        restrictionId,
        {
          allowed_domains: domains,
          allow_no_referrer: options.allowNoReferrer,
        },
      );

      if (options.json) {
        console.log(JSON.stringify(restriction, null, 2));
      } else {
        console.log('Referrer restriction updated successfully');
        console.log(`  ID: ${restriction.id}`);
        if (restriction.referrer?.allowed_domains) {
          console.log(
            `  Allowed Domains: ${restriction.referrer.allowed_domains.join(', ')}`,
          );
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
