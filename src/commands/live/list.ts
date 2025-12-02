import { Command } from "@cliffy/command";
import type { LiveStream } from "@mux/mux-node/resources/video/live-streams";
import {
	formatCreatedAt,
	formatLiveStreamStatus,
	formatSeconds,
	truncateMiddle,
} from "../../lib/formatters.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface ListOptions {
	limit?: number;
	page?: number;
	json?: boolean;
	compact?: boolean;
}

export const listCommand = new Command()
	.description("List all Mux live streams")
	.option("--limit <number:number>", "Number of results to return", {
		default: 25,
	})
	.option("--page <number:number>", "Page number for pagination", {
		default: 1,
	})
	.option("--json", "Output JSON instead of pretty format")
	.option("--compact", "Output one line per stream (grep-friendly)")
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
			} else if (options.compact) {
				// Compact output - one line per stream, grep-friendly
				if (!response.data || response.data.length === 0) {
					console.log("No live streams found.");
					return;
				}

				for (const stream of response.data) {
					printStreamCompact(stream);
				}
			} else {
				// Pretty output
				if (!response.data || response.data.length === 0) {
					console.log("No live streams found.");
					return;
				}

				const streamCount = response.data.length;
				console.log(`Found ${streamCount} live stream(s):\n`);

				for (const stream of response.data) {
					printStreamCard(stream);
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

/**
 * Print a live stream in compact format (one line, grep-friendly)
 */
function printStreamCompact(stream: LiveStream): void {
	const id = stream.id ?? "unknown";
	const status = stream.status ?? "unknown";
	const created = formatCreatedAt(stream.created_at);
	const latency = stream.latency_mode ?? "-";
	const reconnect = stream.reconnect_window
		? `${stream.reconnect_window}s`
		: "-";

	// Playback ID policies (text for grep-ability)
	const playbackIds = stream.playback_ids ?? [];
	const pbPolicies =
		playbackIds.length > 0
			? playbackIds.map((p) => p.policy ?? "public").join(",")
			: "-";

	// Recent asset count
	const recentAssets = stream.recent_asset_ids?.length ?? 0;

	console.log(
		`${id}  ${status}  ${created}  ${latency}  ${reconnect}  ${pbPolicies}  ${recentAssets} assets`,
	);
}

/**
 * Print a live stream in card format
 */
function printStreamCard(stream: LiveStream): void {
	// Line 1: Stream ID, colored status, created date
	const id = stream.id ?? "unknown";
	const status = formatLiveStreamStatus(stream.status);
	const created = formatCreatedAt(stream.created_at);

	console.log(`${id}  ${status}  ${created}`);

	// Details section
	const details = collectStreamDetails(stream);
	if (details.length > 0) {
		console.log("  Details:");
		for (let i = 0; i < details.length; i++) {
			const isLast = i === details.length - 1;
			const connector = isLast ? "└─" : "├─";
			console.log(`    ${connector} ${details[i]}`);
		}
	}

	// Recent Assets section
	const recentAssetIds = stream.recent_asset_ids ?? [];
	if (recentAssetIds.length > 0) {
		console.log("  Recent Assets:");
		for (let i = 0; i < recentAssetIds.length; i++) {
			const isLast = i === recentAssetIds.length - 1;
			const connector = isLast ? "└─" : "├─";
			console.log(`    ${connector} ${recentAssetIds[i]}`);
		}
	}

	// Playback IDs section
	const playbackIds = stream.playback_ids ?? [];
	if (playbackIds.length > 0) {
		console.log("  Playback IDs:");
		for (let i = 0; i < playbackIds.length; i++) {
			const p = playbackIds[i];
			const isLast = i === playbackIds.length - 1;
			const connector = isLast ? "└─" : "├─";
			const icon = p.policy === "signed" ? "🔒" : "🔓";
			console.log(`    ${connector} ${icon} ${p.id}`);
		}
	}

	console.log(); // Blank line between streams
}

/**
 * Collect stream details into displayable strings
 */
function collectStreamDetails(stream: LiveStream): string[] {
	const details: string[] = [];

	if (stream.stream_key) {
		details.push(`Stream Key: ${truncateMiddle(stream.stream_key)}`);
	}
	if (stream.latency_mode) {
		details.push(`Latency Mode: ${stream.latency_mode}`);
	}
	if (stream.reconnect_window) {
		details.push(`Reconnect Window: ${stream.reconnect_window}s`);
	}
	if (stream.max_continuous_duration) {
		details.push(
			`Max Duration: ${formatSeconds(stream.max_continuous_duration)}`,
		);
	}

	return details;
}
