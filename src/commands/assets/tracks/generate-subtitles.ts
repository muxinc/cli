import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

interface GenerateSubtitlesOptions {
  languageCode?: string;
  name?: string;
  passthrough?: string;
  json?: boolean;
}

export const generateSubtitlesCommand = new Command()
  .description(
    'Generate subtitles for an audio track using automatic speech recognition',
  )
  .arguments('<asset-id:string> <track-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'Language for generated subtitles (default: en)',
  )
  .option('--name <name:string>', 'Name for the subtitle track')
  .option(
    '--passthrough <passthrough:string>',
    'Passthrough metadata (max 255 characters)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (
      options: GenerateSubtitlesOptions,
      assetId: string,
      trackId: string,
    ) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        const subtitle: Record<string, unknown> = {};

        if (options.languageCode !== undefined) {
          subtitle.language_code = options.languageCode;
        } else {
          subtitle.language_code = 'en';
        }

        if (options.name !== undefined) {
          subtitle.name = options.name;
        }
        if (options.passthrough !== undefined) {
          subtitle.passthrough = options.passthrough;
        }

        const result = await mux.video.assets.generateSubtitles(
          assetId,
          trackId,
          { generated_subtitles: [subtitle as never] },
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('Subtitle generation started successfully');
          if (result.length > 0) {
            for (const track of result) {
              console.log(`  Track ID: ${track.id}`);
              console.log(`  Type: ${track.type}`);
              if (track.status) {
                console.log(`  Status: ${track.status}`);
              }
            }
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
    },
  );
