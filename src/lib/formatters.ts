import type { Asset } from "@mux/mux-node/resources/video/assets";
import type { LiveStream } from "@mux/mux-node/resources/video/live-streams";

/**
 * Format an asset for pretty console output
 */
export function formatAsset(asset: Asset): void {
	console.log(`Asset ID: ${asset.id}`);
	console.log(`Status: ${asset.status}`);
	console.log(
		`Duration: ${asset.duration ? `${asset.duration.toFixed(2)}s` : "N/A"}`,
	);
	console.log(`Created: ${asset.created_at}`);

	if (asset.aspect_ratio) {
		console.log(`Aspect Ratio: ${asset.aspect_ratio}`);
	}

	if (asset.resolution_tier) {
		console.log(`Resolution Tier: ${asset.resolution_tier}`);
	}

	if (asset.video_quality) {
		console.log(`Video Quality: ${asset.video_quality}`);
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
		console.log(
			"\nWARNING: This is a test asset (will be deleted after 24 hours)",
		);
	}

	if (asset.errors?.messages && asset.errors.messages.length > 0) {
		console.log("\nErrors:");
		for (const error of asset.errors.messages) {
			console.log(`  - ${error}`);
		}
	}
}

/**
 * Format a live stream for pretty console output
 */
export function formatLiveStream(stream: LiveStream): void {
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
			console.log(`    URL: https://stream.mux.com/${playbackId.id}.m3u8`);
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
