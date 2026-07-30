import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface DimensionsOptions {
  json?: boolean;
}

export const dimensionsCommand = new Command()
  .description('List available monitoring dimensions')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DimensionsOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const response = await mux.data.monitoring.listDimensions();

      if (wantsJson(options)) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No monitoring dimensions found.');
        return;
      }

      for (const dimension of data) {
        console.log(`${dimension.name}: ${dimension.display_name}`);
      }
    } catch (error) {
      await handleCommandError(error, 'monitoring', 'dimensions', options);
    }
  });
