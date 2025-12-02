import { colors } from "@cliffy/ansi/colors";
import { Command } from "@cliffy/command";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface ListOptions {
	limit?: number;
	page?: number;
	uploadId?: string;
	liveStreamId?: string;
	json?: boolean;
	compact?: boolean;
}

export const listCommand = new Command()
	.description("List all Mux video assets")
	.option("--limit <number:number>", "Number of results to return", {
		default: 25,
	})
	.option("--page <number:number>", "Page number for pagination", {
		default: 1,
	})
	.option("--upload-id <id:string>", "Filter by upload ID")
	.option("--live-stream-id <id:string>", "Filter by live stream ID")
	.option("--json", "Output JSON instead of pretty format")
	.option("--compact", "Output one line per asset (grep-friendly)")
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
			} else if (options.compact) {
				// Compact output - one line per asset, grep-friendly
				if (!response.data || response.data.length === 0) {
					console.log("No assets found.");
					return;
				}

				for (const asset of response.data) {
					printAssetCompact(asset);
				}
			} else {
				// Pretty output
				if (!response.data || response.data.length === 0) {
					console.log("No assets found.");
					return;
				}

				const assetCount = response.data?.length ?? 0;
				console.log(`Found ${assetCount} asset(s):\n`);

				for (const asset of response.data) {
					printAssetCard(asset);
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
 * Print an asset in compact format (one line, grep-friendly)
 */
function printAssetCompact(asset: Asset): void {
	const id = asset.id ?? "unknown";
	const status = asset.status ?? "unknown";
	const duration = formatDuration(asset.duration);
	const created = formatCreatedAt(asset.created_at);
	const resolution = asset.resolution_tier ?? "-";

	// Get title from meta
	const title = asset.meta?.title ? `"${asset.meta.title}"` : "-";

	// Playback ID policies (text for grep-ability)
	const playbackIds = asset.playback_ids ?? [];
	const pbPolicies =
		playbackIds.length > 0
			? playbackIds.map((p) => p.policy ?? "public").join(",")
			: "-";

	// Static renditions
	const renditions = formatStaticRenditions(asset.static_renditions) ?? "-";

	console.log(
		`${id}  ${status}  ${duration}  ${created}  ${resolution}  ${title}  ${pbPolicies}  ${renditions}`,
	);
}

/**
 * Print an asset in card format
 */
function printAssetCard(asset: Asset): void {
	// Line 1: Asset ID, colored status, duration, created date
	const id = asset.id ?? "unknown";
	const status = formatStatus(asset.status);
	const duration = formatDuration(asset.duration);
	const created = formatCreatedAt(asset.created_at);

	console.log(`${id}  ${status}  ${duration}  ${created}`);

	// Asset details section (resolution, quality, etc.)
	const details = collectAssetDetails(asset);
	if (details.length > 0) {
		console.log("  Details:");
		for (let i = 0; i < details.length; i++) {
			const isLast = i === details.length - 1;
			const connector = isLast ? "└─" : "├─";
			console.log(`    ${connector} ${details[i]}`);
		}
	}

	// Meta section (user-defined metadata: title, creator_id, external_id)
	const meta = collectMeta(asset);
	if (meta.length > 0) {
		console.log("  Meta:");
		for (let i = 0; i < meta.length; i++) {
			const isLast = i === meta.length - 1;
			const connector = isLast ? "└─" : "├─";
			console.log(`    ${connector} ${meta[i]}`);
		}
	}

	// Static renditions section
	const renditions = formatStaticRenditions(asset.static_renditions);
	if (renditions) {
		console.log("  Static Renditions:");
		console.log(`    └─ ${renditions}`);
	}

	// Playback IDs section
	const playbackIds = asset.playback_ids ?? [];
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

	console.log(); // Blank line between assets
}

/**
 * Collect asset details (resolution, quality, etc.) into displayable strings
 */
function collectAssetDetails(asset: Asset): string[] {
	const details: string[] = [];

	if (asset.aspect_ratio) {
		details.push(`Aspect Ratio: ${asset.aspect_ratio}`);
	}
	if (asset.resolution_tier) {
		details.push(`Resolution: ${asset.resolution_tier}`);
	}
	if (asset.max_stored_resolution) {
		details.push(`Max Stored: ${asset.max_stored_resolution}`);
	}
	if (asset.video_quality) {
		details.push(`Quality: ${asset.video_quality}`);
	}
	if (asset.passthrough) {
		details.push(`Passthrough: ${asset.passthrough}`);
	}

	return details;
}

/**
 * Collect user-defined meta fields (title, creator_id, external_id)
 */
function collectMeta(asset: Asset): string[] {
	const meta: string[] = [];
	const assetMeta = asset.meta;

	if (!assetMeta) return meta;

	if (assetMeta.title) {
		meta.push(`Title: ${assetMeta.title}`);
	}
	if (assetMeta.creator_id) {
		meta.push(`Creator ID: ${assetMeta.creator_id}`);
	}
	if (assetMeta.external_id) {
		meta.push(`External ID: ${assetMeta.external_id}`);
	}

	return meta;
}

/**
 * Format status with color
 */
function formatStatus(status: string | undefined): string {
	switch (status) {
		case "ready":
			return colors.green(status);
		case "preparing":
			return colors.yellow(status);
		case "errored":
			return colors.red(status);
		default:
			return colors.dim(status ?? "unknown");
	}
}

/**
 * Format duration as m:ss
 */
function formatDuration(duration: number | undefined): string {
	if (!duration) return "-";
	const mins = Math.floor(duration / 60);
	const secs = Math.floor(duration % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format created_at timestamp to short format
 * Mux API returns Unix timestamp as a string
 */
function formatCreatedAt(createdAt: string | undefined): string {
	if (!createdAt) return "-";
	const timestamp = Number.parseInt(createdAt, 10);
	if (Number.isNaN(timestamp)) return "-";
	const date = new Date(timestamp * 1000);

	// Check if date is valid
	if (Number.isNaN(date.getTime())) return "-";

	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");

	return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Format static renditions as comma-separated resolution names
 * Returns null if no renditions to display
 */
function formatStaticRenditions(
	staticRenditions: Asset["static_renditions"],
): string | null {
	if (!staticRenditions?.files || staticRenditions.files.length === 0) {
		return null;
	}

	// Filter to only ready renditions and extract resolution name from filename
	const renditionNames = staticRenditions.files
		.filter((f) => f.status === "ready")
		.map((f) => {
			// Extract resolution from filename (e.g., "low.mp4" -> "low")
			const name = f.name ?? "";
			return name.replace(/\.[^.]+$/, "");
		})
		.filter((name) => name.length > 0);

	if (renditionNames.length === 0) return null;
	return renditionNames.join(", ");
}
