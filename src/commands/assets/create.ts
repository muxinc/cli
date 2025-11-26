import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import type Mux from "@mux/mux-node";
import { expandGlobPattern, uploadFile } from "../../lib/file-upload.ts";
import { parseAssetConfig } from "../../lib/json-config.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

// Extract types from Mux SDK
type PlaybackPolicy = Mux.PlaybackPolicy;
type EncodingTier = NonNullable<Mux.Video.AssetCreateParams["encoding_tier"]>;
type Mp4Support = NonNullable<Mux.Video.AssetCreateParams["mp4_support"]>;

interface CreateOptions {
	url?: string;
	upload?: string;
	file?: string;
	playbackPolicy?: string | string[];
	test?: boolean;
	passthrough?: string;
	mp4Support?: string;
	encodingTier?: string;
	normalizeAudio?: boolean;
	yes?: boolean;
	json?: boolean;
	wait?: boolean;
}

interface UploadResult {
	file: string;
	uploadId: string;
	status: string;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Create assets from URL ingestion
 */
async function createFromUrl(
	mux: Mux,
	url: string,
	options: CreateOptions,
): Promise<Mux.Video.Asset> {
	const params: Mux.Video.AssetCreateParams = {
		inputs: [{ url }],
	};

	// Add optional parameters from flags
	if (options.playbackPolicy !== undefined) {
		const policies = Array.isArray(options.playbackPolicy)
			? options.playbackPolicy
			: [options.playbackPolicy];
		params.playback_policy = policies as PlaybackPolicy[];
	}
	if (options.test !== undefined) {
		params.test = true;
	}
	if (options.passthrough !== undefined) {
		params.passthrough = options.passthrough;
	}
	if (options.mp4Support !== undefined) {
		params.mp4_support = options.mp4Support as Mp4Support;
	}
	if (options.encodingTier !== undefined) {
		params.encoding_tier = options.encodingTier as EncodingTier;
	}
	if (options.normalizeAudio !== undefined) {
		params.normalize_audio = true;
	}

	const asset = await mux.video.assets.create(params);
	return asset;
}

/**
 * Create assets from local file uploads
 */
async function createFromUploads(
	mux: Mux,
	pattern: string,
	options: CreateOptions,
): Promise<UploadResult[]> {
	// Expand glob pattern
	const files = await expandGlobPattern(pattern);

	if (files.length === 0) {
		throw new Error(`No files found matching pattern: ${pattern}`);
	}

	// Show files and confirm (unless -y flag)
	if (!options.yes && files.length > 1) {
		if (!options.json) {
			console.log(`Found ${files.length} files to upload:`);
			const totalSize = files.reduce((sum, f) => sum + f.size, 0);
			for (const file of files) {
				console.log(`  - ${file.name} (${formatBytes(file.size)})`);
			}
			console.log(`Total size: ${formatBytes(totalSize)}`);
			console.log();
		}

		const confirmed = await Confirm.prompt({
			message: "Continue with upload?",
			default: true,
		});

		if (!confirmed) {
			throw new Error("Upload cancelled by user");
		}
	}

	const results: UploadResult[] = [];

	// Upload each file
	for (const file of files) {
		if (!options.json) {
			console.log(`Uploading ${file.name}...`);
		}

		// Create direct upload
		const newAssetSettings: Record<string, unknown> = {};

		// Add asset settings from flags
		if (options.playbackPolicy !== undefined) {
			const policies = Array.isArray(options.playbackPolicy)
				? options.playbackPolicy
				: [options.playbackPolicy];
			newAssetSettings.playback_policy = policies as PlaybackPolicy[];
		}
		if (options.passthrough !== undefined) {
			newAssetSettings.passthrough = options.passthrough;
		}
		if (options.mp4Support !== undefined) {
			newAssetSettings.mp4_support = options.mp4Support as Mp4Support;
		}
		if (options.encodingTier !== undefined) {
			newAssetSettings.encoding_tier = options.encodingTier as EncodingTier;
		}
		if (options.normalizeAudio !== undefined) {
			newAssetSettings.normalize_audio = true;
		}

		const uploadParams: Mux.Video.UploadCreateParams = {
			cors_origin: "*",
			new_asset_settings: newAssetSettings,
		};

		if (options.test !== undefined) {
			uploadParams.test = true;
		}

		const upload = await mux.video.uploads.create(uploadParams);

		// Upload the file
		await uploadFile(file.path, upload.url, upload.id, (percent) => {
			if (!options.json && percent === 100) {
				console.log(`${file.name} uploaded`);
			}
		});

		results.push({
			file: file.name,
			uploadId: upload.id,
			status: upload.status,
		});
	}

	return results;
}

/**
 * Create asset from JSON config file
 */
async function createFromConfig(
	mux: Mux,
	configPath: string,
	options: CreateOptions,
): Promise<Mux.Video.Asset> {
	// Parse config file
	const config = await parseAssetConfig(configPath);

	// Merge with flag overrides
	if (options.playbackPolicy !== undefined) {
		config.playback_policy = Array.isArray(options.playbackPolicy)
			? options.playbackPolicy
			: [options.playbackPolicy];
	}
	if (options.test !== undefined) {
		config.test = options.test;
	}
	if (options.passthrough !== undefined) {
		config.passthrough = options.passthrough;
	}
	if (options.mp4Support !== undefined) {
		config.mp4_support = options.mp4Support;
	}
	if (options.encodingTier !== undefined) {
		config.encoding_tier = options.encodingTier;
	}
	if (options.normalizeAudio !== undefined) {
		config.normalize_audio = options.normalizeAudio;
	}

	const asset = await mux.video.assets.create(
		config as Mux.Video.AssetCreateParams,
	);
	return asset;
}

export const createCommand = new Command()
	.description("Create a new Mux video asset")
	.option("--url <url:string>", "Video URL to ingest from the web")
	.option(
		"--upload <path:string>",
		"Local file(s) to upload (supports glob patterns)",
	)
	.option("--file, -f <path:string>", "JSON configuration file")
	.option(
		"--playback-policy <policy:string>",
		"Playback policy (public or signed). Can be specified multiple times.",
		{
			collect: true,
			value: (value: string): string => {
				const validPolicies = ["public", "signed"];
				if (!validPolicies.includes(value)) {
					throw new Error(
						`Invalid playback policy: ${value}. Must be one of: ${validPolicies.join(", ")}`,
					);
				}
				return value;
			},
		},
	)
	.option(
		"--test",
		"Create test asset (watermarked, 10s limit, deleted after 24h)",
	)
	.option(
		"--passthrough <string:string>",
		"User metadata (max 255 characters)",
		{
			value: (value: string): string => {
				if (value.length > 255) {
					throw new Error(
						`Passthrough metadata exceeds maximum length of 255 characters (provided: ${value.length})`,
					);
				}
				return value;
			},
		},
	)
	.option(
		"--mp4-support <option:string>",
		"MP4 support level (none, capped-1080p, audio-only, audio-only,capped-1080p, standard)",
		{
			value: (value: string): string => {
				const validOptions = [
					"none",
					"capped-1080p",
					"audio-only",
					"audio-only,capped-1080p",
					"standard",
				];
				if (!validOptions.includes(value)) {
					throw new Error(
						`Invalid mp4-support value: ${value}. Must be one of: ${validOptions.join(", ")}`,
					);
				}
				return value;
			},
		},
	)
	.option(
		"--encoding-tier <tier:string>",
		"Encoding tier (smart or baseline)",
		{
			value: (value: string): string => {
				const validTiers = ["smart", "baseline"];
				if (!validTiers.includes(value)) {
					throw new Error(
						`Invalid encoding tier: ${value}. Must be one of: ${validTiers.join(", ")}`,
					);
				}
				return value;
			},
		},
	)
	.option("--normalize-audio", "Normalize audio loudness level")
	.option("-y, --yes", "Skip confirmation prompts")
	.option("--json", "Output JSON instead of pretty format")
	.option("--wait", "Wait for asset processing to complete")
	.action(async (options: CreateOptions) => {
		try {
			// Validate input method
			const inputMethods = [options.url, options.upload, options.file].filter(
				Boolean,
			);
			if (inputMethods.length === 0) {
				throw new Error(
					"Must provide one input method: --url, --upload, or --file",
				);
			}
			if (inputMethods.length > 1) {
				throw new Error(
					"Cannot use multiple input methods. Choose one: --url, --upload, or --file",
				);
			}

			// Initialize authenticated Mux client
			const mux = await createAuthenticatedMuxClient();

			let result: Mux.Video.Asset | UploadResult[];

			// Execute appropriate creation method
			if (options.url) {
				result = await createFromUrl(mux, options.url, options);

				if (options.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log(`Asset created: ${result.id}`);
					console.log(`  Status: ${result.status}`);
					if (result.playback_ids && result.playback_ids.length > 0) {
						console.log(
							`  Playback URL: https://stream.mux.com/${result.playback_ids[0].id}.m3u8`,
						);
					}
				}
			} else if (options.upload) {
				result = await createFromUploads(mux, options.upload, options);

				if (options.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log(`\n${result.length} file(s) uploaded successfully`);
					for (const upload of result) {
						console.log(`  - ${upload.file}: Upload ID ${upload.uploadId}`);
					}
				}
			} else if (options.file) {
				result = await createFromConfig(mux, options.file, options);

				if (options.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log(`Asset created: ${result.id}`);
					console.log(`  Status: ${result.status}`);
					if (result.playback_ids && result.playback_ids.length > 0) {
						console.log(
							`  Playback URL: https://stream.mux.com/${result.playback_ids[0].id}.m3u8`,
						);
					}
				}
			} else {
				// This should never happen due to validation above
				throw new Error("No input method provided");
			}

			// Wait for asset processing if requested
			if (options.wait && !Array.isArray(result) && result.id) {
				if (!options.json) {
					console.log("\nWaiting for asset to be ready...");
				}

				let asset = result;
				const maxAttempts = 60; // 5 minutes with 5s intervals
				let attempts = 0;

				while (asset.status === "preparing" && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 5000));
					asset = await mux.video.assets.retrieve(result.id);
					attempts++;

					if (!options.json) {
						process.stdout.write(".");
					}
				}

				if (!options.json) {
					console.log();
				}

				if (asset.status === "ready") {
					if (!options.json) {
						console.log("Asset is ready!");
					}
				} else if (asset.status === "errored") {
					throw new Error(
						`Asset processing failed: ${asset.errors?.messages?.join(", ") || "Unknown error"}`,
					);
				} else {
					if (!options.json) {
						console.log(
							"WARNING: Asset is still processing. Check status later.",
						);
					}
				}

				if (options.json) {
					console.log(JSON.stringify(asset, null, 2));
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
