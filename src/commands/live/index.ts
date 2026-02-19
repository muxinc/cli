import { Command } from '@cliffy/command';
import { completeCommand } from './complete.ts';
import { createCommand } from './create.ts';
import { deleteCommand } from './delete.ts';
import { deleteNewAssetStaticRenditionsCommand } from './delete-new-asset-static-renditions.ts';
import { disableCommand } from './disable.ts';
import { enableCommand } from './enable.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { playbackIdsCommand } from './playback-ids/index.ts';
import { resetStreamKeyCommand } from './reset-stream-key.ts';
import { simulcastTargetsCommand } from './simulcast-targets/index.ts';
import { updateCommand } from './update.ts';
import { updateEmbeddedSubtitlesCommand } from './update-embedded-subtitles.ts';
import { updateGeneratedSubtitlesCommand } from './update-generated-subtitles.ts';
import { updateNewAssetStaticRenditionsCommand } from './update-new-asset-static-renditions.ts';

export const liveCommand = new Command()
  .description(
    'Manage Mux live streams (RTMP/SRT ingest endpoints for broadcasting)',
  )
  .action(function () {
    this.showHelp();
  })
  .command('create', createCommand)
  .command('list', listCommand)
  .command('get', getCommand)
  .command('update', updateCommand)
  .command('delete', deleteCommand)
  .command('complete', completeCommand)
  .command('disable', disableCommand)
  .command('enable', enableCommand)
  .command('reset-stream-key', resetStreamKeyCommand)
  .command('update-embedded-subtitles', updateEmbeddedSubtitlesCommand)
  .command('update-generated-subtitles', updateGeneratedSubtitlesCommand)
  .command(
    'update-new-asset-static-renditions',
    updateNewAssetStaticRenditionsCommand,
  )
  .command(
    'delete-new-asset-static-renditions',
    deleteNewAssetStaticRenditionsCommand,
  )
  .command('playback-ids', playbackIdsCommand)
  .command('simulcast-targets', simulcastTargetsCommand);
