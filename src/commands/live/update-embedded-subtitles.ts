import { Command } from '@cliffy/command';
import { formatLiveStream } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateEmbeddedSubtitlesOptions {
  languageChannel?: string;
  languageCode?: string;
  name?: string;
  passthrough?: string;
  clear?: boolean;
  json?: boolean;
}

export const updateEmbeddedSubtitlesCommand = new Command()
  .description('Update embedded subtitle configuration for a live stream')
  .arguments('<stream-id:string>')
  .option(
    '--language-channel <languageChannel:string>',
    'CEA-608 caption channel (cc1, cc2, cc3, or cc4)',
    {
      value: (value: string): string => {
        if (!['cc1', 'cc2', 'cc3', 'cc4'].includes(value)) {
          throw new Error(
            `Invalid language channel: ${value}. Must be "cc1", "cc2", "cc3", or "cc4".`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code for the caption track',
  )
  .option('--name <name:string>', 'Name for the closed caption track')
  .option(
    '--passthrough <passthrough:string>',
    'Passthrough metadata (max 255 characters)',
  )
  .option('--clear', 'Remove all embedded subtitle configuration')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateEmbeddedSubtitlesOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      let embeddedSubtitles: Array<Record<string, unknown>> = [];

      if (!options.clear) {
        const subtitle: Record<string, unknown> = {};

        if (options.languageChannel !== undefined) {
          subtitle.language_channel = options.languageChannel;
        }
        if (options.languageCode !== undefined) {
          subtitle.language_code = options.languageCode;
        }
        if (options.name !== undefined) {
          subtitle.name = options.name;
        }
        if (options.passthrough !== undefined) {
          subtitle.passthrough = options.passthrough;
        }

        if (Object.keys(subtitle).length > 0) {
          embeddedSubtitles = [subtitle];
        }
      }

      const stream = await mux.video.liveStreams.updateEmbeddedSubtitles(
        streamId,
        { embedded_subtitles: embeddedSubtitles as never },
      );

      if (options.json) {
        console.log(JSON.stringify(stream, null, 2));
      } else {
        if (options.clear) {
          console.log('Embedded subtitle configuration cleared.\n');
        } else {
          console.log('Embedded subtitle configuration updated.\n');
        }
        formatLiveStream(stream);
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
