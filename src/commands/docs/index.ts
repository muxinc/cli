import { Command } from '@cliffy/command';
import { readCommand } from './read.ts';
import { searchCommand } from './search.ts';
import { sourceCommand } from './source.ts';
import { updateCommand } from './update.ts';

export const docsCommand = new Command()
  .description('Search, read, and refresh Mux docs')
  .action(function () {
    this.showHelp();
  })
  .command('search', searchCommand)
  .command('read', readCommand)
  .command('update', updateCommand)
  .command('source', sourceCommand);
