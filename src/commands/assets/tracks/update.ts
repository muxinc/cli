import { Command } from '@cliffy/command';
import type { AssetUpdateTrackParams } from '@mux/ts/resources/video/assets';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface UpdateOptions {
  name?: string;
  languageCode?: string;
  closedCaptions?: boolean;
  passthrough?: string;
  json?: boolean;
}

export const updateCommand = new Command()
  .description('Update a track on a Mux video asset (name, language, etc.)')
  .arguments('<asset-id:string> <track-id:string>')
  .option('--name <name:string>', 'Human-readable name for the track')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code (e.g., en-US)',
  )
  .option(
    '--closed-captions <closedCaptions:boolean>',
    'Whether the track provides Subtitles for the Deaf or Hard-of-hearing (SDH)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, assetId: string, trackId: string) => {
    try {
      const params: AssetUpdateTrackParams = {};

      if (options.name !== undefined) {
        params.name = options.name;
      }
      if (options.languageCode !== undefined) {
        params.language_code = options.languageCode;
      }
      if (options.closedCaptions !== undefined) {
        params.closed_captions = options.closedCaptions;
      }
      if (options.passthrough !== undefined) {
        params.passthrough = options.passthrough;
      }

      if (Object.keys(params).length === 0) {
        throw new Error(
          'At least one field must be specified: --name, --language-code, --closed-captions, or --passthrough',
        );
      }

      const mux = await createAuthenticatedMuxClient();

      const track = await mux.video.assets.updateTrack(
        assetId,
        trackId,
        params,
      );

      if (wantsJson(options)) {
        console.log(JSON.stringify(track, null, 2));
      } else {
        console.log('Track updated successfully');
        console.log(`  ID: ${track.id}`);
        console.log(`  Type: ${track.type}`);
        if (track.name) {
          console.log(`  Name: ${track.name}`);
        }
        if (track.language_code) {
          console.log(`  Language: ${track.language_code}`);
        }
        if (track.status) {
          console.log(`  Status: ${track.status}`);
        }
      }
    } catch (error) {
      await handleCommandError(error, 'assets', 'update', options);
    }
  });
