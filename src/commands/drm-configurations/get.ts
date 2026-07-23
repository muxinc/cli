import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

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

      if (wantsJson(options)) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(`DRM Configuration ID: ${config.id}`);
      }
    } catch (error) {
      await handleCommandError(error, 'drm-configurations', 'get', options);
    }
  });
