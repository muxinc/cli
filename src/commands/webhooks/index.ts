import { Command } from '@cliffy/command';
import { eventsCommand } from './events/index.ts';
import { listenCommand } from './listen.ts';

export const webhooksCommand = new Command()
  .description('Listen for and manage Mux webhook events')
  .action(function () {
    this.showHelp();
  })
  .command('listen', listenCommand)
  .command('events', eventsCommand);
