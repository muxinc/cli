import { Command } from "@cliffy/command";
import { formatAsset, formatLiveStream } from "../../lib/formatters.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface PlaybackIdOptions {
	json?: boolean;
	expand?: boolean;
}

export const playbackIdsCommand = new Command()
	.description("Look up the asset or live stream associated with a playback ID")
	.arguments("<playback-id:string>")
	.option("--json", "Output JSON instead of pretty format")
	.option("--expand", "Fetch and return the full asset or live stream object")
	.action(async (options: PlaybackIdOptions, playbackId: string) => {
		try {
			const mux = await createAuthenticatedMuxClient();

			// Look up the playback ID
			const playbackIdInfo = await mux.video.playbackIds.retrieve(playbackId);

			// If --expand is set, fetch the full object
			if (options.expand) {
				if (playbackIdInfo.object.type === "asset") {
					const asset = await mux.video.assets.retrieve(
						playbackIdInfo.object.id,
					);
					if (options.json) {
						console.log(JSON.stringify(asset, null, 2));
					} else {
						formatAsset(asset);
					}
				} else if (playbackIdInfo.object.type === "live_stream") {
					const stream = await mux.video.liveStreams.retrieve(
						playbackIdInfo.object.id,
					);
					if (options.json) {
						console.log(JSON.stringify(stream, null, 2));
					} else {
						formatLiveStream(stream);
					}
				} else {
					throw new Error(
						`Unknown playback ID type: ${playbackIdInfo.object.type}`,
					);
				}
			} else {
				// Just return the playback ID info
				if (options.json) {
					console.log(JSON.stringify(playbackIdInfo, null, 2));
				} else {
					console.log(`Playback ID: ${playbackIdInfo.id}`);
					console.log(`Policy: ${playbackIdInfo.policy}`);
					console.log(`Type: ${playbackIdInfo.object.type}`);
					console.log(`ID: ${playbackIdInfo.object.id}`);
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
