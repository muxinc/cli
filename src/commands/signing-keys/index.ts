import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';

export const signingKeysCommand = new Command()
  .description(
    'Manage signing keys (required to generate signed URLs for assets with "signed" playback policy)',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('delete', deleteCommand);
