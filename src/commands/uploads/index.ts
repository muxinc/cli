import { Command } from '@cliffy/command';
import { cancelCommand } from './cancel.ts';
import { createCommand } from './create.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';

export const uploadsCommand = new Command()
  .description('Manage Mux direct uploads for client-side video uploading')
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('cancel', cancelCommand);
