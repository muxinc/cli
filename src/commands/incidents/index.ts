import { Command } from '@cliffy/command';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { relatedCommand } from './related.ts';

export const incidentsCommand = new Command()
  .description(
    'View incidents (automatically detected playback quality issues) from Mux Data',
  )
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('get', getCommand)
  .command('related', relatedCommand);
