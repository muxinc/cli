import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List direct uploads')
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per upload (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const uploads = await mux.video.uploads.list({
        limit: options.limit,
        page: options.page,
      });

      if (options.json) {
        console.log(JSON.stringify(uploads, null, 2));
        return;
      }

      const data = uploads.data ?? [];

      if (data.length === 0) {
        console.log('No uploads found.');
        return;
      }

      if (options.compact) {
        for (const upload of data) {
          const parts = [upload.id, upload.status, upload.asset_id ?? '-'];
          console.log(parts.join('\t'));
        }
      } else {
        for (const upload of data) {
          console.log(`Upload ID: ${upload.id}`);
          console.log(`  Status: ${upload.status}`);
          if (upload.asset_id) {
            console.log(`  Asset ID: ${upload.asset_id}`);
          }
          console.log(`  CORS Origin: ${upload.cors_origin}`);
          console.log(`  Timeout: ${upload.timeout}s`);
          if (upload.error) {
            console.log(
              `  Error: ${upload.error.message ?? upload.error.type}`,
            );
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
