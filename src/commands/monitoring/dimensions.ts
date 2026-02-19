import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

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

      if (options.json) {
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
