import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface CreateOptions {
  allowedDomains: string[];
  allowNoReferrer?: boolean;
  allowNoUserAgent?: boolean;
  allowHighRiskUserAgent?: boolean;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Create a new playback restriction')
  .option(
    '--allowed-domains <domain:string>',
    'Allowed referrer domains. Can be specified multiple times.',
    { collect: true, required: true },
  )
  .option('--allow-no-referrer', 'Allow playback when no referrer is sent')
  .option('--allow-no-user-agent', 'Allow playback when no user agent is sent')
  .option(
    '--allow-high-risk-user-agent',
    'Allow playback from high-risk user agents',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const domains = options.allowedDomains;

      const restriction = await mux.video.playbackRestrictions.create({
        referrer: {
          allowed_domains: domains,
          allow_no_referrer: options.allowNoReferrer,
        },
        user_agent: {
          allow_no_user_agent: options.allowNoUserAgent,
          allow_high_risk_user_agent: options.allowHighRiskUserAgent,
        },
      });

      if (options.json) {
        console.log(JSON.stringify(restriction, null, 2));
      } else {
        console.log('Playback restriction created successfully');
        console.log(`  ID: ${restriction.id}`);
        if (restriction.referrer?.allowed_domains) {
          console.log(
            `  Allowed Domains: ${restriction.referrer.allowed_domains.join(', ')}`,
          );
        }
        if (restriction.referrer?.allow_no_referrer) {
          console.log('  Allow No Referrer: true');
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
