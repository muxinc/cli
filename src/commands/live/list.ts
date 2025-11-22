import { Command } from "@cliffy/command";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface ListOptions {
  limit?: number;
  page?: number;
  json?: boolean;
}

export const listCommand = new Command()
  .description("List all Mux live streams")
  .option("--limit <number:number>", "Number of results to return", { default: 25 })
  .option("--page <number:number>", "Page number for pagination", { default: 1 })
  .option("--json", "Output JSON instead of pretty format")
  .action(async (options: ListOptions) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Build API parameters
      const params: {
        limit?: number;
        page?: number;
      } = {
        limit: options.limit,
        page: options.page,
      };

      // Fetch live streams
      const response = await mux.video.liveStreams.list(params);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        // Pretty output
        if (!response.data || response.data.length === 0) {
          console.log("No live streams found.");
          return;
        }

        const streamCount = response.data.length;
        console.log(`Found ${streamCount} live stream(s):\n`);

        for (const stream of response.data) {
          console.log(`Stream ID: ${stream.id}`);
          console.log(`  Status: ${stream.status}`);
          console.log(`  Created: ${stream.created_at}`);

          if (stream.playback_ids && stream.playback_ids.length > 0) {
            console.log(`  Playback URL: https://stream.mux.com/${stream.playback_ids[0].id}.m3u8`);
          }

          if (stream.reconnect_window) {
            console.log(`  Reconnect Window: ${stream.reconnect_window}s`);
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
