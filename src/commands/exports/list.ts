import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

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

      if (wantsJson(options)) {
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
      await handleCommandError(error, 'exports', 'list', options);
    }
  });
