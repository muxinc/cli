import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';
import { getPlayerUrl, getStreamUrl } from '../../../lib/urls.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List all playback IDs for an asset')
  .arguments('<asset-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const asset = await mux.video.assets.retrieve(assetId);
      const playbackIds = asset.playback_ids ?? [];

      if (options.json) {
        const output = playbackIds.map((p) => ({
          id: p.id,
          policy: p.policy,
          stream_url: getStreamUrl(p.id as string),
          player_url: getPlayerUrl(p.id as string),
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        if (playbackIds.length === 0) {
          console.log(`No playback IDs found for asset ${assetId}`);
          return;
        }

        console.log(`Playback IDs for asset ${assetId}:\n`);

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
