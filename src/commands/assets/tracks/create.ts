import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

interface CreateOptions {
  url: string;
  type: string;
  languageCode: string;
  name?: string;
  textType?: string;
  closedCaptions?: boolean;
  passthrough?: string;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Add a text or audio track to a Mux video asset')
  .arguments('<asset-id:string>')
  .option(
    '--url <url:string>',
    'Publicly accessible URL of the track file (http/https)',
    { required: true },
  )
  .option('--type <type:string>', 'Track type (text or audio)', {
    required: true,
    value: (value: string): string => {
      if (value !== 'text' && value !== 'audio') {
        throw new Error(
          `Invalid track type: ${value}. Must be "text" or "audio".`,
        );
      }
      return value;
    },
  })
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code (e.g., en-US)',
    { required: true },
  )
  .option('--name <name:string>', 'Human-readable name for the track')
  .option(
    '--text-type <textType:string>',
    'Text track type (subtitles or captions)',
    {
      value: (value: string): string => {
        if (value !== 'subtitles' && value !== 'captions') {
          throw new Error(
            `Invalid text type: ${value}. Must be "subtitles" or "captions".`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--closed-captions',
    'Indicates the track provides Subtitles for the Deaf or Hard-of-hearing (SDH)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        url: options.url,
        type: options.type,
        language_code: options.languageCode,
      };

      if (options.name !== undefined) {
        params.name = options.name;
      }
      if (options.textType !== undefined) {
        params.text_type = options.textType;
      }
      if (options.closedCaptions !== undefined) {
        params.closed_captions = options.closedCaptions;
      }
      if (options.passthrough !== undefined) {
        params.passthrough = options.passthrough;
      }

      const track = await mux.video.assets.createTrack(
        assetId,
        params as never,
      );

      if (options.json) {
        console.log(JSON.stringify(track, null, 2));
      } else {
        console.log('Track created successfully');
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
