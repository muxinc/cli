import { Command } from '@cliffy/command';
import { browseCommand } from './browse.ts';
import { listCommand } from './list.ts';
import { replayCommand } from './replay.ts';

export const eventsCommand = new Command()
  .description('Manage locally stored webhook events')
  .action(function () {
    this.showHelp();
  })
  .command('browse', browseCommand)
  .command('list', listCommand)
  .command('replay', replayCommand);
