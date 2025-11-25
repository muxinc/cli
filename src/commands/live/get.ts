import { Command } from "@cliffy/command";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface GetOptions {
	json?: boolean;
}

export const getCommand = new Command()
	.description("Get details about a specific Mux live stream")
	.arguments("<stream-id:string>")
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: GetOptions, streamId: string) => {
		try {
			// Initialize authenticated Mux client
			const mux = await createAuthenticatedMuxClient();

			// Fetch live stream details
			const stream = await mux.video.liveStreams.retrieve(streamId);

			if (options.json) {
				console.log(JSON.stringify(stream, null, 2));
			} else {
				// Pretty output
				console.log(`Stream ID: ${stream.id}`);
				console.log(`Status: ${stream.status}`);
				console.log(`Created: ${stream.created_at}`);
				console.log(`Stream Key: ${stream.stream_key}`);

				if (stream.latency_mode) {
					console.log(`Latency Mode: ${stream.latency_mode}`);
				}

				if (stream.reconnect_window) {
					console.log(`Reconnect Window: ${stream.reconnect_window}s`);
				}

				if (stream.playback_ids && stream.playback_ids.length > 0) {
					console.log("\nPlayback IDs:");
					for (const playbackId of stream.playback_ids) {
						console.log(`  - ${playbackId.id} (${playbackId.policy})`);
						console.log(
							`    URL: https://stream.mux.com/${playbackId.id}.m3u8`,
						);
					}
				}

				if (stream.recent_asset_ids && stream.recent_asset_ids.length > 0) {
					console.log("\nRecent Assets:");
					for (const assetId of stream.recent_asset_ids) {
						console.log(`  - ${assetId}`);
					}
				}

				if (stream.test) {
					console.log(
						"\nWARNING: This is a test stream (will be deleted after 24 hours)",
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
