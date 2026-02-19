import { Command } from '@cliffy/command';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';

export const drmConfigurationsCommand = new Command()
  .description(
    'Manage Mux DRM configurations (content protection keys for encrypted playback)',
  )
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('get', getCommand);
