import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { updateReferrerCommand } from './update-referrer.ts';
import { updateUserAgentCommand } from './update-user-agent.ts';

export const playbackRestrictionsCommand = new Command()
  .description(
    'Manage playback restrictions (domain and user agent rules for playback)',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('delete', deleteCommand)
  .command('update-referrer', updateReferrerCommand)
  .command('update-user-agent', updateUserAgentCommand);
