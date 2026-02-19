import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List available dimensions from Mux Data')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const response = await mux.data.dimensions.list();

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const dimensions = response.data;

      const basic = dimensions.basic ?? [];
      const advanced = dimensions.advanced ?? [];

      console.log('Basic Dimensions:');
      if (basic.length === 0) {
        console.log('  (none)');
      } else {
        for (const dim of basic) {
          console.log(`  ${dim}`);
        }
      }

      console.log('');
      console.log('Advanced Dimensions:');
      if (advanced.length === 0) {
        console.log('  (none)');
      } else {
        for (const dim of advanced) {
          console.log(`  ${dim}`);
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
