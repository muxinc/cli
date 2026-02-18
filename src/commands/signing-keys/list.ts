import { Command } from '@cliffy/command';
import { readConfig } from '../../lib/config.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List all signing keys')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Fetch signing keys from API
      const signingKeys = await mux.system.signingKeys.list();

      // Read local config to see which keys are configured
      const config = await readConfig();
      const activeKeys = new Map<string, string[]>();

      if (config) {
        for (const [envName, env] of Object.entries(config.environments)) {
          if (env.signingKeyId) {
            if (!activeKeys.has(env.signingKeyId)) {
              activeKeys.set(env.signingKeyId, []);
            }
            activeKeys.get(env.signingKeyId)?.push(envName);
          }
        }
      }

      if (options.json) {
        const data = [];
        for await (const key of signingKeys) {
          const envs = activeKeys.get(key.id);
          data.push({
            id: key.id,
            created_at: key.created_at,
            active_in_environments: envs || [],
          });
        }
        console.log(JSON.stringify({ data }, null, 2));
      } else {
        console.log('Signing Keys:');
        let hasKeys = false;
        for await (const key of signingKeys) {
          hasKeys = true;
          const envs = activeKeys.get(key.id);
          const envIndicator =
            envs && envs.length > 0 ? ` [Active in: ${envs.join(', ')}]` : '';
          console.log(`  ${key.id}  Created: ${key.created_at}${envIndicator}`);
        }

        if (!hasKeys) {
          console.log('  No signing keys found');
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
