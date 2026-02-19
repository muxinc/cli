import { Command } from '@cliffy/command';
import { listCommand } from './list.ts';
import { valuesCommand } from './values.ts';

export const dimensionsCommand = new Command()
  .description(
    'View dimensions (filterable attributes like country, browser, OS) from Mux Data',
  )
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('values', valuesCommand);
