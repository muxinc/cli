import { Command } from '@cliffy/command';
import {
  getEnvironment,
  getEnvironmentAuthType,
  listEnvironments,
  readConfig,
  setCurrentEnvironment,
} from '@/lib/config.ts';
import { isAgentMode, wantsJson } from '@/lib/context.ts';
import { inputPrompt } from '@/lib/prompt.ts';

/**
 * Prompt for one of the configured environments. Interactive only: a missing
 * argument stays an error under --json or in agent mode, where there is no one
 * to ask.
 */
async function promptForEnvironment(): Promise<string> {
  const config = await readConfig();
  const names = config ? Object.keys(config.environments) : [];

  console.log('Configured environments:\n');
  names.forEach((name, index) => {
    const environment = config?.environments[name];
    const current = name === config?.defaultEnvironment ? ' (current)' : '';
    const type = environment ? `   ${getEnvironmentAuthType(environment)}` : '';
    console.log(`  ${index + 1}. ${name}${current}${type}`);
  });
  console.log('');

  const answer = await inputPrompt({
    message: 'Environment (name or number):',
  });
  const trimmed = answer.trim();

  const byNumber = Number.parseInt(trimmed, 10);
  if (
    !Number.isNaN(byNumber) &&
    byNumber >= 1 &&
    byNumber <= names.length &&
    String(byNumber) === trimmed
  ) {
    return names[byNumber - 1];
  }

  return trimmed;
}

export const switchCommand = new Command()
  .description(
    'Switch the default environment (used by all subsequent mux commands)',
  )
  .arguments('[name:string]')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: { json?: boolean }, name?: string) => {
    const json = wantsJson(options);

    /** Report a failure in whichever format the caller asked for, then exit. */
    const fail = (error: string, hint: string): never => {
      if (json) {
        console.error(JSON.stringify({ error }, null, 2));
      } else {
        console.error(`❌ ${error}`);
        console.log(`\n${hint}`);
      }
      process.exit(1);
    };

    let target = name;

    if (!target) {
      const names = await listEnvironments();
      if (names.length === 0) {
        fail('No environments configured.', "Run 'mux login' to add one.");
      }

      if (json || isAgentMode() || !process.stdin.isTTY) {
        fail(
          'Specify an environment name.',
          "Run 'mux env list' to see available environments.",
        );
      }

      target = await promptForEnvironment();
    }

    // Check if environment exists
    const env = await getEnvironment(target);

    if (!env) {
      fail(
        `Environment "${target}" does not exist.`,
        "Run 'mux env list' to see available environments.",
      );
    }

    // Set as default
    await setCurrentEnvironment(target);

    const shadowed = Boolean(
      process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET,
    );

    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            environment: target,
            // Env var credentials outrank this selection, so a machine caller
            // needs to know the switch will not change which account is used.
            shadowed_by_environment_variables: shadowed,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`✅ Switched default environment to: ${target}`);

    if (shadowed) {
      console.log(
        "\nNote: MUX_TOKEN_ID/MUX_TOKEN_SECRET are set and take precedence over this selection. Run 'mux auth status' for details.",
      );
    }
  });
