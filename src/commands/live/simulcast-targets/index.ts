import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';

export const simulcastTargetsCommand = new Command()
  .description(
    'Manage simulcast targets (restream to third-party platforms like YouTube or Twitch) for Mux live streams',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('get', getCommand)
  .command('delete', deleteCommand);
