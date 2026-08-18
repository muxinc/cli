import { Command } from '@cliffy/command';
import {
  getCurrentEnvironment,
  getEnvironment,
  listEnvironments,
  removeEnvironment,
} from '../lib/config.ts';
import { wantsJson } from '../lib/context.ts';
import { revokeRefreshToken } from '../lib/oauth.ts';

interface LogoutOptions {
  all?: boolean;
  json?: boolean;
}

/**
 * Revoke an OAuth refresh token server-side. Best effort: the user's intent is
 * to stop using the credential here, and that happens whether or not the
 * authorization server can be reached.
 */
async function revokeIfOAuth(
  name: string,
  json: boolean,
): Promise<string | null> {
  const environment = await getEnvironment(name);
  if (!environment?.oauth) return null;

  try {
    await revokeRefreshToken(environment.oauth.refreshToken);
    return null;
  } catch (error) {
    const warning = `Could not revoke the refresh token for "${name}" (${
      error instanceof Error ? error.message : String(error)
    }). Removing the local credentials anyway.`;
    if (!json) {
      console.error(`⚠️  ${warning}`);
    }
    return warning;
  }
}

export const logoutCommand = new Command()
  .description('Remove stored credentials for an environment by name')
  .arguments('[name:string]')
  .option('--all', 'Remove stored credentials for every environment')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: LogoutOptions, name?: string) => {
    const json = wantsJson(options);

    // Explicitly typed: TypeScript only narrows after a never-returning call
    // when the callee's type is declared, not just inferred.
    const fail: (error: string, hint?: string) => never = (error, hint) => {
      if (json) {
        console.error(JSON.stringify({ error }, null, 2));
      } else {
        console.error(`❌ ${error}`);
        if (hint) console.log(`\n${hint}`);
      }
      process.exit(1);
    };

    if (options.all) {
      const names = await listEnvironments();
      if (names.length === 0) {
        if (json) {
          console.log(JSON.stringify({ success: true, removed: [] }, null, 2));
        } else {
          console.log('No environments configured.');
        }
        return;
      }

      const warnings: string[] = [];
      for (const envName of names) {
        const warning = await revokeIfOAuth(envName, json);
        if (warning) warnings.push(warning);
        await removeEnvironment(envName);
        if (!json) {
          console.log(`✅ Removed environment: ${envName}`);
        }
      }

      if (json) {
        console.log(
          JSON.stringify({ success: true, removed: names, warnings }, null, 2),
        );
        return;
      }

      console.log("\nRun 'mux login' to sign in again.");
      return;
    }

    if (!name) {
      fail(
        'Specify an environment name, or pass --all.',
        "Run 'mux env list' to see available environments.",
      );
    }

    // Check if environment exists
    const env = await getEnvironment(name);

    if (!env) {
      fail(
        `Environment "${name}" does not exist.`,
        "Run 'mux env list' to see available environments.",
      );
    }

    // Check if this is the current environment
    const currentEnv = await getCurrentEnvironment();
    const wasCurrent = currentEnv?.name === name;

    const warning = await revokeIfOAuth(name, json);

    // Remove the environment
    await removeEnvironment(name);

    const newCurrent = wasCurrent ? await getCurrentEnvironment() : currentEnv;

    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            removed: [name],
            current_environment: newCurrent?.name ?? null,
            warnings: warning ? [warning] : [],
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`✅ Removed environment: ${name}`);

    if (wasCurrent) {
      if (newCurrent) {
        console.log(`✅ New current environment: ${newCurrent.name}`);
      } else {
        console.log("\nNo environments remaining. Run 'mux login' to add one.");
      }
    }
  });
