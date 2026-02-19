import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List video view export files from Mux Data')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const response = await mux.data.exports.listVideoViews();

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No export files found.');
        return;
      }

      for (const exportEntry of data) {
        console.log(`Export Date: ${exportEntry.export_date}`);
        const files = exportEntry.files ?? [];
        for (const file of files) {
          console.log(`  - ${file.path} (${file.type})`);
        }
        console.log('');
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
