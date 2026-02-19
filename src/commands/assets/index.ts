import { Command } from '@cliffy/command';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';
import { inputInfoCommand } from './input-info.ts';
import { listCommand } from './list.ts';
import { manageCommand } from './manage/index.ts';
import { playbackIdsCommand } from './playback-ids/index.ts';
import { staticRenditionsCommand } from './static-renditions/index.ts';
import { tracksCommand } from './tracks/index.ts';
import { updateCommand } from './update.ts';
import { updateMasterAccessCommand } from './update-master-access.ts';

export const assetsCommand = new Command()
  .description(
    'Manage Mux video assets (uploaded or ingested videos ready for streaming)',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('update', updateCommand)
  .command('delete', deleteCommand)
  .command('input-info', inputInfoCommand)
  .command('update-master-access', updateMasterAccessCommand)
  .command('manage', manageCommand)
  .command('playback-ids', playbackIdsCommand)
  .command('static-renditions', staticRenditionsCommand)
  .command('tracks', tracksCommand);
