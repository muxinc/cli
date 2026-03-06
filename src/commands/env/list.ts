import { Command } from '@cliffy/command';
import { readConfig } from '../../lib/config.ts';

export const listCommand = new Command()
  .description('List all configured environments')
  .action(async () => {
    const config = await readConfig();

    if (!config || Object.keys(config.environments).length === 0) {
      console.log('No environments configured.');
      console.log("\nRun 'mux login' to add an environment.");
      return;
    }

    console.log('Configured environments:\n');

    const envNames = Object.keys(config.environments);
    const currentEnv = config.defaultEnvironment;

    for (const name of envNames) {
      const isCurrent = name === currentEnv;
      const marker = isCurrent ? '* ' : '  ';
      console.log(`${marker}${name}${isCurrent ? ' (current)' : ''}`);
    }

    console.log(
      `\n${envNames.length} environment${envNames.length === 1 ? '' : 's'} total`,
    );
  });
