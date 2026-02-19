import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List playback restrictions')
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per restriction (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const restrictions = await mux.video.playbackRestrictions.list({
        limit: options.limit,
        page: options.page,
      });

      if (options.json) {
        console.log(JSON.stringify(restrictions, null, 2));
        return;
      }

      const data = restrictions.data ?? [];

      if (data.length === 0) {
        console.log('No playback restrictions found.');
        return;
      }

      if (options.compact) {
        for (const restriction of data) {
          const domains =
            restriction.referrer?.allowed_domains?.join(',') ?? '-';
          console.log(`${restriction.id}\t${domains}`);
        }
      } else {
        for (const restriction of data) {
          console.log(`Restriction ID: ${restriction.id}`);
          if (restriction.referrer?.allowed_domains) {
            console.log(
              `  Allowed Domains: ${restriction.referrer.allowed_domains.join(', ')}`,
            );
          }
          if (restriction.referrer?.allow_no_referrer) {
            console.log('  Allow No Referrer: true');
          }
          if (restriction.user_agent?.allow_no_user_agent) {
            console.log('  Allow No User Agent: true');
          }
          if (restriction.user_agent?.allow_high_risk_user_agent) {
            console.log('  Allow High Risk User Agent: true');
          }
          console.log('');
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
