import { Command } from '@cliffy/command';
import { formatLiveStream } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

const VALID_RESOLUTIONS = [
  'highest',
  'audio-only',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '540p',
  '480p',
  '360p',
  '270p',
];

export const updateNewAssetStaticRenditionsCommand = new Command()
  .description(
    'Update static rendition settings for new assets created by a live stream',
  )
  .arguments('<stream-id:string>')
  .option(
    '--resolution <resolution:string>',
    `Resolution for static renditions (${VALID_RESOLUTIONS.join(', ')}). Can be specified multiple times.`,
    {
      collect: true,
      required: true,
      value: (value: string): string => {
        if (!VALID_RESOLUTIONS.includes(value)) {
          throw new Error(
            `Invalid resolution: ${value}. Must be one of: ${VALID_RESOLUTIONS.join(', ')}`,
          );
        }
        return value;
      },
    },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (
      options: { resolution: string; json?: boolean },
      streamId: string,
    ) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        const resolutions = (options as unknown as { resolution: string[] })
          .resolution;
        const staticRenditions = resolutions.map((resolution: string) => ({
          resolution: resolution as
            | 'highest'
            | 'audio-only'
            | '2160p'
            | '1440p'
            | '1080p'
            | '720p'
            | '540p'
            | '480p'
            | '360p'
            | '270p',
        }));

        const stream =
          await mux.video.liveStreams.updateNewAssetSettingsStaticRenditions(
            streamId,
            { static_renditions: staticRenditions },
          );

        if (options.json) {
          console.log(JSON.stringify(stream, null, 2));
        } else {
          console.log('Static rendition settings updated.\n');
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
    },
  );
