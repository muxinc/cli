import { Command } from '@cliffy/command';
import { docsPathCommand } from './path.ts';

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const docsCommand: Command<any> = new Command()
  .description(
    'Locate the agent skills embedded in this CLI build.\n\nFor agents and other tooling, start with `mux docs path --json`.',
  )
  .action(function () {
    this.showHelp();
  })
  .command('path', docsPathCommand);
