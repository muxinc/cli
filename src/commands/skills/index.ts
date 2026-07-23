import { Command } from '@cliffy/command';
import { skillsInstallCommand } from './install.ts';
import { skillsPathCommand } from './path.ts';

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const skillsCommand: Command<any> = new Command()
  .description(
    'Locate or install the agent skills embedded in this CLI build.\n\nFor agents and other tooling, start with `mux skills path --json`.',
  )
  .action(function () {
    this.showHelp();
  })
  .command('path', skillsPathCommand)
  .command('install', skillsInstallCommand);
