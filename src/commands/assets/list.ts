import { Command } from "@cliffy/command";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface ListOptions {
  limit?: number;
  page?: number;
  uploadId?: string;
  liveStreamId?: string;
  json?: boolean;
}

export const listCommand = new Command()
  .description("List all Mux video assets")
  .option("--limit <number:number>", "Number of results to return", { default: 25 })
  .option("--page <number:number>", "Page number for pagination", { default: 1 })
  .option("--upload-id <id:string>", "Filter by upload ID")
  .option("--live-stream-id <id:string>", "Filter by live stream ID")
  .option("--json", "Output JSON instead of pretty format")
  .action(async (options: ListOptions) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Build API parameters
      const params: {
        limit?: number;
        page?: number;
        upload_id?: string;
        live_stream_id?: string;
      } = {
        limit: options.limit,
        page: options.page,
      };

      if (options.uploadId) {
        params.upload_id = options.uploadId;
      }

      if (options.liveStreamId) {
        params.live_stream_id = options.liveStreamId;
      }

      // Fetch assets
      const response = await mux.video.assets.list(params);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        // Pretty output
        if (!response.data || response.data.length === 0) {
          console.log("No assets found.");
          return;
        }

        const assetCount = response.data?.length ?? 0;
        console.log(`Found ${assetCount} asset(s):\n`);

        for (const asset of response.data) {
          console.log(`Asset ID: ${asset.id}`);
          console.log(`  Status: ${asset.status}`);
          console.log(`  Duration: ${asset.duration ? `${asset.duration.toFixed(2)}s` : "N/A"}`);
          console.log(`  Created: ${asset.created_at}`);

          if (asset.playback_ids && asset.playback_ids.length > 0) {
            console.log(`  Playback URL: https://stream.mux.com/${asset.playback_ids[0].id}.m3u8`);
          }

          if (asset.passthrough) {
            console.log(`  Passthrough: ${asset.passthrough}`);
          }

          console.log();
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
