import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific DRM configuration')
  .arguments('<drm-configuration-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, drmConfigurationId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const config =
        await mux.video.drmConfigurations.retrieve(drmConfigurationId);

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(`DRM Configuration ID: ${config.id}`);
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
