import { Command } from '@cliffy/command';
import { listCommand } from './list.ts';

export const errorsCommand = new Command()
  .description('View playback errors from Mux Data')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand);
