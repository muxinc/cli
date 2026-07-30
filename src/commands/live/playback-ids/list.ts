import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { getPlayerUrl, getStreamUrl } from '@/lib/urls.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List all playback IDs for a live stream')
  .arguments('<live-stream-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions, liveStreamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const liveStream = await mux.video.liveStreams.retrieve(liveStreamId);
      const playbackIds = liveStream.playback_ids ?? [];

      if (wantsJson(options)) {
        const output = playbackIds.map((p) => ({
          id: p.id,
          policy: p.policy,
          stream_url: getStreamUrl(p.id as string),
          player_url: getPlayerUrl(p.id as string),
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        if (playbackIds.length === 0) {
          console.log(`No playback IDs found for live stream ${liveStreamId}.`);
          console.log(
            `Run 'mux live playback-ids create ${liveStreamId}' to add one.`,
          );
          return;
        }

        console.log(`Playback IDs for live stream ${liveStreamId}:\n`);

        for (const playbackId of playbackIds) {
          console.log(`  ${playbackId.id} (${playbackId.policy})`);
          console.log(
            `    Stream URL: ${getStreamUrl(playbackId.id as string)}`,
          );
          console.log(
            `    Player URL: ${getPlayerUrl(playbackId.id as string)}`,
          );

          if (playbackId.policy === 'signed') {
            console.log('    (requires signing)');
          }
          console.log();
        }
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'list', options);
    }
  });
