import { Command } from '@cliffy/command';
import { listCommand } from './list.ts';

export const deliveryUsageCommand = new Command()
  .description('View delivery usage reports for Mux video assets')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand);
