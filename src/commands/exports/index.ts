import { Command } from '@cliffy/command';
import { listCommand } from './list.ts';

export const exportsCommand = new Command()
  .description(
    'View export files (downloadable CSVs of raw view data) from Mux Data',
  )
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand);
