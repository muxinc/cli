import { Command } from '@cliffy/command';
import { deleteCommand } from './delete.ts';
import { generateCommand } from './generate.ts';
import { getCommand } from './get.ts';

export const shotsCommand = new Command()
  .description('Manage shot detection data for Mux video assets')
  .action(function () {
    this.showHelp();
  })
  .command('get', getCommand)
  .command('generate', generateCommand)
  .command('delete', deleteCommand);
