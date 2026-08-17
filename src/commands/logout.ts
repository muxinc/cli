import { Command } from '@cliffy/command';
import {
  getCurrentEnvironment,
  getEnvironment,
  listEnvironments,
  removeEnvironment,
} from '../lib/config.ts';
import { revokeRefreshToken } from '../lib/oauth.ts';

/**
 * Revoke an OAuth refresh token server-side. Best effort: the user's intent is
 * to stop using the credential here, and that happens whether or not the
 * authorization server can be reached.
 */
async function revokeIfOAuth(name: string): Promise<void> {
  const environment = await getEnvironment(name);
  if (!environment?.oauth) return;

  try {
    await revokeRefreshToken(environment.oauth.refreshToken);
  } catch (error) {
    console.error(
      `⚠️  Could not revoke the refresh token for "${name}" (${
        error instanceof Error ? error.message : String(error)
      }). Removing the local credentials anyway.`,
    );
  }
}

export const logoutCommand = new Command()
  .description('Remove stored credentials for an environment by name')
  .arguments('[name:string]')
  .option('--all', 'Remove stored credentials for every environment')
  .action(async (options: { all?: boolean }, name?: string) => {
    if (options.all) {
      const names = await listEnvironments();
      if (names.length === 0) {
        console.log('No environments configured.');
        return;
      }

      for (const envName of names) {
        await revokeIfOAuth(envName);
        await removeEnvironment(envName);
        console.log(`✅ Removed environment: ${envName}`);
      }

      console.log("\nRun 'mux login' to sign in again.");
      return;
    }

    if (!name) {
      console.error('❌ Specify an environment name, or pass --all.');
      console.log("\nRun 'mux env list' to see available environments.");
      process.exit(1);
    }

    // Check if environment exists
    const env = await getEnvironment(name);

    if (!env) {
      console.error(`❌ Environment "${name}" does not exist.`);
      console.log("\nRun 'mux env list' to see available environments.");
      process.exit(1);
    }

    // Check if this is the current environment
    const currentEnv = await getCurrentEnvironment();
    const wasCurrent = currentEnv?.name === name;

    await revokeIfOAuth(name);

    // Remove the environment
    await removeEnvironment(name);

    console.log(`✅ Removed environment: ${name}`);

    if (wasCurrent) {
      const newCurrent = await getCurrentEnvironment();
      if (newCurrent) {
        console.log(`✅ New current environment: ${newCurrent.name}`);
      } else {
        console.log("\nNo environments remaining. Run 'mux login' to add one.");
      }
    }
  });
