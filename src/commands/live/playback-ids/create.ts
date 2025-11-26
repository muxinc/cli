import { Command } from "@cliffy/command";
import { createAuthenticatedMuxClient } from "../../../lib/mux.ts";
import {
	createLiveStreamPlaybackId,
	type PlaybackIdPolicy,
} from "../../../lib/playback-ids.ts";
import { getStreamUrl, getPlayerUrl } from "../../../lib/urls.ts";

interface CreateOptions {
	policy?: PlaybackIdPolicy;
	json?: boolean;
}

export const createCommand = new Command()
	.description("Create a new playback ID for a live stream")
	.arguments("<live-stream-id:string>")
	.option(
		"-p, --policy <policy:string>",
		"Playback policy (public or signed)",
		{
			default: "public",
			value: (value: string): PlaybackIdPolicy => {
				if (value !== "public" && value !== "signed") {
					throw new Error(
						`Invalid policy: ${value}. Must be "public" or "signed".`,
					);
				}
				return value;
			},
		},
	)
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: CreateOptions, liveStreamId: string) => {
		try {
			const mux = await createAuthenticatedMuxClient();
			const policy = options.policy ?? "public";

			const playbackId = await createLiveStreamPlaybackId(
				mux,
				liveStreamId,
				policy,
			);

			if (options.json) {
				console.log(
					JSON.stringify(
						{
							...playbackId,
							stream_url: getStreamUrl(playbackId.id),
							player_url: getPlayerUrl(playbackId.id),
						},
						null,
						2,
					),
				);
			} else {
				console.log(`Created playback ID: ${playbackId.id}`);
				console.log(`  Policy: ${playbackId.policy}`);
				console.log(`  Stream URL: ${getStreamUrl(playbackId.id)}`);
				console.log(`  Player URL: ${getPlayerUrl(playbackId.id)}`);

				if (playbackId.policy === "signed") {
					console.log(
						"\nNote: This playback ID requires signing. Use 'mux sign <playback-id>' to generate a signed URL.",
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
