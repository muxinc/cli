import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { eventsCommand } from './events/index.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { listenCommand } from './listen.ts';
import { triggerCommand } from './trigger.ts';
import { updateCommand } from './update.ts';

export const webhooksCommand = new Command()
  .description('Listen for, configure, and manage Mux webhooks and events')
  .action(function () {
    this.showHelp();
  })
  .command('listen', listenCommand)
  .command('trigger', triggerCommand)
  .command('events', eventsCommand)
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('update', updateCommand)
  .command('delete', deleteCommand);
