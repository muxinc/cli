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
    let target = name;

    if (!target) {
      const names = await listEnvironments();
      if (names.length === 0) {
        console.error('❌ No environments configured.');
        console.log("\nRun 'mux login' to add one.");
        process.exit(1);
      }

      if (wantsJson(options) || isAgentMode() || !process.stdin.isTTY) {
        console.error('❌ Specify an environment name.');
        console.log("\nRun 'mux env list' to see available environments.");
        process.exit(1);
      }

      target = await promptForEnvironment();
    }

    // Check if environment exists
    const env = await getEnvironment(target);

    if (!env) {
      console.error(`❌ Environment "${target}" does not exist.`);
      console.log("\nRun 'mux env list' to see available environments.");
      process.exit(1);
    }

    // Set as default
    await setCurrentEnvironment(target);
    console.log(`✅ Switched default environment to: ${target}`);

    if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
      console.log(
        "\nNote: MUX_TOKEN_ID/MUX_TOKEN_SECRET are set and take precedence over this selection. Run 'mux auth status' for details.",
      );
    }
  });
