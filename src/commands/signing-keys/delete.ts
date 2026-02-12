import { Command } from '@cliffy/command';
import { readConfig, setEnvironment } from '../../lib/config.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Delete a signing key')
  .arguments('<signing-key-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, signingKeyId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Read local config to see if this key is configured in any environment
      const config = await readConfig();
      const affectedEnvironments: string[] = [];

      if (config) {
        for (const [envName, env] of Object.entries(config.environments)) {
          if (env.signingKeyId === signingKeyId) {
            affectedEnvironments.push(envName);
          }
        }
      }

      // Show warning if key is in use
      if (affectedEnvironments.length > 0 && !options.json) {
        console.log(
          `WARNING: This signing key is currently configured in environment${affectedEnvironments.length > 1 ? 's' : ''}: ${affectedEnvironments.join(', ')}`,
        );
        console.log(
          'Deleting this key will invalidate all signed URLs using it.',
        );
        console.log('');
      }

      // Confirm deletion unless --force flag is provided
      if (!options.force) {
        // For JSON mode, require explicit --force flag for safety
        if (options.json) {
          throw new Error(
            'Deletion requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete signing key ${signingKeyId}?`,
          default: false,
        });

        if (!confirmed) {
          if (options.json) {
            console.log(JSON.stringify({ cancelled: true }, null, 2));
          } else {
            console.log('Deletion cancelled.');
          }
          return;
        }
      }

      // Delete the signing key via API
      await mux.system.signingKeys.delete(signingKeyId);

      // Remove from environment configs if present
      if (config && affectedEnvironments.length > 0) {
        for (const envName of affectedEnvironments) {
          const env = config.environments[envName];
          await setEnvironment(envName, {
            ...env,
            signingKeyId: undefined,
            signingPrivateKey: undefined,
          });
        }
      }

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              signingKeyId,
              removedFromEnvironments: affectedEnvironments,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`Signing key ${signingKeyId} deleted successfully.`);

        if (affectedEnvironments.length > 0) {
          console.log(
            `Environment${affectedEnvironments.length > 1 ? 's' : ''} '${affectedEnvironments.join("', '")}' ${affectedEnvironments.length > 1 ? 'have' : 'has'} been updated (signing key removed).`,
          );
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
