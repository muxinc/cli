import { Command } from "@cliffy/command";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import { createAuthenticatedMuxClient } from "../../../lib/mux.ts";

type StaticRenditionFile = NonNullable<
	NonNullable<Asset["static_renditions"]>["files"]
>[number];

interface ListOptions {
	json?: boolean;
}

export const listCommand = new Command()
	.description("List static renditions for an asset")
	.arguments("<asset-id:string>")
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: ListOptions, assetId: string) => {
		try {
			const mux = await createAuthenticatedMuxClient();

			const asset = await mux.video.assets.retrieve(assetId);
			const staticRenditions = asset.static_renditions;
			const files = staticRenditions?.files ?? [];

			if (options.json) {
				console.log(
					JSON.stringify(
						files.map((file) => formatFileForJson(file)),
						null,
						2,
					),
				);
			} else {
				if (files.length === 0) {
					console.log(`No static renditions found for asset ${assetId}`);
					return;
				}

				console.log(`Static renditions for asset ${assetId}:\n`);

				for (const file of files) {
					printRenditionFile(file);
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

function formatFileForJson(file: StaticRenditionFile) {
	return {
		id: file.id,
		name: file.name,
		resolution: file.resolution,
		status: file.status,
		ext: file.ext,
		width: file.width,
		height: file.height,
		bitrate: file.bitrate,
		filesize: file.filesize,
		passthrough: file.passthrough,
	};
}

function printRenditionFile(file: StaticRenditionFile) {
	const name = (file.name ?? "unknown").padEnd(16);
	const status = `[${file.status ?? "unknown"}]`.padEnd(12);
	const dimensions =
		file.width && file.height
			? `${file.width}x${file.height}`.padEnd(12)
			: "-".padEnd(12);
	const bitrate = file.bitrate
		? formatBitrate(file.bitrate).padEnd(10)
		: "-".padEnd(10);
	const filesize = file.filesize ? formatFilesize(file.filesize) : "-";

	console.log(`  ${name} ${status} ${dimensions} ${bitrate} ${filesize}`);

	if (file.passthrough) {
		console.log(`    Passthrough: ${file.passthrough}`);
	}
	if (file.id) {
		console.log(`    ID: ${file.id}`);
	}
}

function formatBitrate(bps: number): string {
	if (bps >= 1_000_000) {
		return `${(bps / 1_000_000).toFixed(1)} Mbps`;
	}
	if (bps >= 1_000) {
		return `${(bps / 1_000).toFixed(0)} kbps`;
	}
	return `${bps} bps`;
}

function formatFilesize(bytes: string): string {
	const size = Number.parseInt(bytes, 10);
	if (Number.isNaN(size)) return bytes;

	if (size >= 1_000_000_000) {
		return `${(size / 1_000_000_000).toFixed(1)} GB`;
	}
	if (size >= 1_000_000) {
		return `${(size / 1_000_000).toFixed(1)} MB`;
	}
	if (size >= 1_000) {
		return `${(size / 1_000).toFixed(1)} KB`;
	}
	return `${size} B`;
}
