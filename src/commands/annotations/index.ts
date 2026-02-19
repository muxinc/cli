import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { updateCommand } from './update.ts';

export const annotationsCommand = new Command()
  .description(
    'Manage annotations (event markers for deployments, releases, etc.) in Mux Data',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('update', updateCommand)
  .command('delete', deleteCommand);
