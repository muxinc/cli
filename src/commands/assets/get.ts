import { Command } from "@cliffy/command";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description("Get details about a specific Mux video asset")
  .arguments("<asset-id:string>")
  .option("--json", "Output JSON instead of pretty format")
  .action(async (options: GetOptions, assetId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Fetch asset details
      const asset = await mux.video.assets.retrieve(assetId);

      if (options.json) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        // Pretty output
        console.log(`Asset ID: ${asset.id}`);
        console.log(`Status: ${asset.status}`);
        console.log(`Duration: ${asset.duration ? `${asset.duration.toFixed(2)}s` : "N/A"}`);
        console.log(`Created: ${asset.created_at}`);

        if (asset.aspect_ratio) {
          console.log(`Aspect Ratio: ${asset.aspect_ratio}`);
        }

        if (asset.resolution_tier) {
          console.log(`Resolution Tier: ${asset.resolution_tier}`);
        }

        if (asset.encoding_tier) {
          console.log(`Encoding Tier: ${asset.encoding_tier}`);
        }

        if (asset.max_stored_resolution) {
          console.log(`Max Resolution: ${asset.max_stored_resolution}`);
        }

        if (asset.max_stored_frame_rate) {
          console.log(`Max Frame Rate: ${asset.max_stored_frame_rate} fps`);
        }

        if (asset.playback_ids && asset.playback_ids.length > 0) {
          console.log("\nPlayback IDs:");
          for (const playbackId of asset.playback_ids) {
            console.log(`  - ${playbackId.id} (${playbackId.policy})`);
            console.log(`    URL: https://stream.mux.com/${playbackId.id}.m3u8`);
          }
        }

        if (asset.tracks && asset.tracks.length > 0) {
          console.log("\nTracks:");
          for (const track of asset.tracks) {
            console.log(`  - ${track.type}: ${track.id}`);
            if (track.duration) {
              console.log(`    Duration: ${track.duration.toFixed(2)}s`);
            }
          }
        }

        if (asset.passthrough) {
          console.log(`\nPassthrough: ${asset.passthrough}`);
        }

        if (asset.test) {
          console.log("\nWARNING: This is a test asset (will be deleted after 24 hours)");
        }

        if (asset.errors && asset.errors.messages && asset.errors.messages.length > 0) {
          console.log("\nErrors:");
          for (const error of asset.errors.messages) {
            console.log(`  - ${error}`);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
