import { Command } from '@cliffy/command';
import { formatLiveStream } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateOptions {
  latencyMode?: string;
  reconnectWindow?: number;
  maxContinuousDuration?: number;
  passthrough?: string;
  reconnectSlateUrl?: string;
  useSlateForStandardLatency?: boolean;
  title?: string;
  json?: boolean;
}

export const updateCommand = new Command()
  .description('Update configuration on a Mux live stream')
  .arguments('<stream-id:string>')
  .option(
    '--latency-mode <latencyMode:string>',
    'Latency mode (low, reduced, or standard)',
    {
      value: (value: string): string => {
        if (!['low', 'reduced', 'standard'].includes(value)) {
          throw new Error(
            `Invalid latency mode: ${value}. Must be "low", "reduced", or "standard".`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--reconnect-window <reconnectWindow:number>',
    'Reconnect window in seconds (0-1800)',
  )
  .option(
    '--max-continuous-duration <maxContinuousDuration:number>',
    'Max continuous duration in seconds (60-43200)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '--reconnect-slate-url <reconnectSlateUrl:string>',
    'URL of the image to display during reconnect',
  )
  .option(
    '--use-slate-for-standard-latency',
    'Display slate during reconnect for standard latency streams',
  )
  .option('--title <title:string>', 'Title for the live stream')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, streamId: string) => {
    try {
      const hasField =
        options.latencyMode !== undefined ||
        options.reconnectWindow !== undefined ||
        options.maxContinuousDuration !== undefined ||
        options.passthrough !== undefined ||
        options.reconnectSlateUrl !== undefined ||
        options.useSlateForStandardLatency !== undefined ||
        options.title !== undefined;

      if (!hasField) {
        throw new Error(
          'At least one field must be specified: --latency-mode, --reconnect-window, --max-continuous-duration, --passthrough, --reconnect-slate-url, --use-slate-for-standard-latency, or --title',
        );
      }

      const mux = await createAuthenticatedMuxClient();

      const updateParams: Record<string, unknown> = {};

      if (options.latencyMode !== undefined) {
        updateParams.latency_mode = options.latencyMode;
      }
      if (options.reconnectWindow !== undefined) {
        updateParams.reconnect_window = options.reconnectWindow;
      }
      if (options.maxContinuousDuration !== undefined) {
        updateParams.max_continuous_duration = options.maxContinuousDuration;
      }
      if (options.passthrough !== undefined) {
        updateParams.passthrough = options.passthrough;
      }
      if (options.reconnectSlateUrl !== undefined) {
        updateParams.reconnect_slate_url = options.reconnectSlateUrl;
      }
      if (options.useSlateForStandardLatency !== undefined) {
        updateParams.use_slate_for_standard_latency =
          options.useSlateForStandardLatency;
      }
      if (options.title !== undefined) {
        updateParams.title = options.title;
      }

      const stream = await mux.video.liveStreams.update(streamId, updateParams);

      if (options.json) {
        console.log(JSON.stringify(stream, null, 2));
      } else {
        console.log('Live stream updated successfully.\n');
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
