import { Command } from '@cliffy/command';
import type Mux from '@mux/mux-node';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

// Extract types from Mux SDK
type LatencyMode = NonNullable<
  Mux.Video.LiveStreamCreateParams['latency_mode']
>;
type PlaybackPolicy = Mux.PlaybackPolicy;

export const createCommand = new Command()
  .description('Create a new Mux live stream')
  .option(
    '--playback-policy <policy:string>',
    'Playback policy (public or signed). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--new-asset-settings <mode:string>',
    'Automatically create an asset from this live stream (none, or JSON string with settings)',
  )
  .option(
    '--reconnect-window <seconds:number>',
    'Time in seconds a stream can be disconnected before being considered finished',
  )
  .option(
    '--latency-mode <mode:string>',
    'Latency mode: low or standard (default: low)',
  )
  .option('--test', 'Create test live stream (deleted after 24h)')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Validate playback policy values
      if (options.playbackPolicy) {
        const validPolicies = ['public', 'signed'];
        for (const policy of options.playbackPolicy) {
          if (!validPolicies.includes(policy)) {
            throw new Error(
              `Invalid playback policy: ${policy}. Must be 'public' or 'signed'.`,
            );
          }
        }
      }

      // Validate latency mode
      if (options.latencyMode) {
        const validLatencyModes = ['low', 'standard', 'reduced'];
        if (!validLatencyModes.includes(options.latencyMode)) {
          throw new Error(
            `Invalid latency mode: ${options.latencyMode}. Must be 'low', 'standard', or 'reduced'.`,
          );
        }
      }

      // Build API parameters
      const params: {
        playback_policies?: PlaybackPolicy[];
        new_asset_settings?: Record<string, unknown>;
        reconnect_window?: number;
        latency_mode?: LatencyMode;
        test?: boolean;
      } = {};

      if (options.playbackPolicy !== undefined) {
        params.playback_policies = options.playbackPolicy as PlaybackPolicy[];
      }

      if (options.newAssetSettings !== undefined) {
        // If it's "none", don't include it
        if (options.newAssetSettings !== 'none') {
          try {
            params.new_asset_settings = JSON.parse(options.newAssetSettings);
          } catch {
            throw new Error(
              "Invalid JSON for --new-asset-settings. Use 'none' or valid JSON object.",
            );
          }
        }
      }

      if (options.reconnectWindow !== undefined) {
        params.reconnect_window = options.reconnectWindow;
      }

      if (options.latencyMode !== undefined) {
        params.latency_mode = options.latencyMode as LatencyMode;
      }

      if (options.test !== undefined) {
        params.test = true;
      }

      // Create live stream
      const liveStream = await mux.video.liveStreams.create(
        params as Mux.Video.LiveStreamCreateParams,
      );

      if (options.json) {
        console.log(JSON.stringify(liveStream, null, 2));
      } else {
        console.log(`Live stream created: ${liveStream.id}`);
        console.log(`  Status: ${liveStream.status}`);
        console.log(`  Stream Key: ${liveStream.stream_key}`);

        if (liveStream.playback_ids && liveStream.playback_ids.length > 0) {
          console.log(
            `  Playback URL: https://stream.mux.com/${liveStream.playback_ids[0].id}.m3u8`,
          );
        }

        if (liveStream.test) {
          console.log(
            '\nWARNING: This is a test stream (will be deleted after 24 hours)',
          );
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
