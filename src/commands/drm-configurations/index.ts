import { Command } from '@cliffy/command';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';

export const drmConfigurationsCommand = new Command()
  .description('Manage DRM configurations')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('get', getCommand);
