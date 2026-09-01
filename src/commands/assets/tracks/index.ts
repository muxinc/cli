import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { generateSubtitlesCommand } from './generate-subtitles.ts';
import { updateCommand } from './update.ts';

export const tracksCommand = new Command()
  .description('Manage tracks (subtitles, audio) for Mux video assets')
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('update', updateCommand)
  .command('delete', deleteCommand)
  .command('generate-subtitles', generateSubtitlesCommand);
