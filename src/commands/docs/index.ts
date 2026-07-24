import { Command } from '@cliffy/command';
import { docsFindCommand } from './find.ts';

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const docsCommand: Command<any> = new Command()
  .description(
    'Search the live Mux documentation index.\n\nNo docs are stored locally — `find` searches mux.com/llms.txt and prints current page URLs.',
  )
  .action(function () {
    this.showHelp();
  })
  .command('find', docsFindCommand);
