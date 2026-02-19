import { Command } from '@cliffy/command';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';

export const videoViewsCommand = new Command()
  .description('View video view analytics from Mux Data')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('get', getCommand);
