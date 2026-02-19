import { Command } from '@cliffy/command';
import {
  getDefaultEnvironment,
  getEnvironment,
  removeEnvironment,
} from '../lib/config.ts';

export const logoutCommand = new Command()
  .description('Remove stored credentials for an environment by name')
  .arguments('<name:string>')
  .action(async (_options, name: string) => {
    // Check if environment exists
    const env = await getEnvironment(name);

    if (!env) {
      console.error(`❌ Environment "${name}" does not exist.`);
      console.log("\nRun 'mux env list' to see available environments.");
      process.exit(1);
    }

    // Check if this is the default environment
    const defaultEnv = await getDefaultEnvironment();
    const wasDefault = defaultEnv?.name === name;

    // Remove the environment
    await removeEnvironment(name);

    console.log(`✅ Removed environment: ${name}`);

    if (wasDefault) {
      const newDefault = await getDefaultEnvironment();
      if (newDefault) {
        console.log(`✅ New default environment: ${newDefault.name}`);
      } else {
        console.log("\nNo environments remaining. Run 'mux login' to add one.");
      }
    }
  });
