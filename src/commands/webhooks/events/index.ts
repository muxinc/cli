import { Command } from '@cliffy/command';
import { listCommand } from './list.ts';
import { replayCommand } from './replay.ts';

export const eventsCommand = new Command()
  .description('Manage locally stored webhook events')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('replay', replayCommand);
