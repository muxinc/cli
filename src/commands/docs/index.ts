import { Command } from '@cliffy/command';
import { pathCommand } from './path.ts';

export const docsCommand = new Command()
  .description('Locate the embedded agent skill and bundled Mux docs')
  .action(function () {
    this.showHelp();
  })
  .command('path', pathCommand);
