import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import Mux from "@mux/mux-node";
import { getDefaultEnvironment } from "../../lib/config.ts";
import { parseAssetConfig } from "../../lib/json-config.ts";
import { expandGlobPattern, uploadFile } from "../../lib/file-upload.ts";

interface CreateOptions {
  url?: string;
  upload?: string;
  file?: string;
  playbackPolicy?: string[];
  test?: boolean;
  passthrough?: string;
  mp4Support?: string;
  encodingTier?: string;
  normalizeAudio?: boolean;
  yes?: boolean;
  json?: boolean;
  wait?: boolean;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Create assets from URL ingestion
 */
async function createFromUrl(
  mux: Mux,
  url: string,
  options: CreateOptions
): Promise<any> {
  const params: any = {
    input: [{ url }],
  };

  // Add optional parameters from flags
  if (options.playbackPolicy) {
    params.playback_policy = options.playbackPolicy;
  }
  if (options.test) {
    params.test = true;
  }
  if (options.passthrough) {
    params.passthrough = options.passthrough;
  }
  if (options.mp4Support) {
    params.mp4_support = options.mp4Support;
  }
  if (options.encodingTier) {
    params.encoding_tier = options.encodingTier;
  }
  if (options.normalizeAudio) {
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
  options: CreateOptions
): Promise<any[]> {
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

  const results: any[] = [];

  // Upload each file
  for (const file of files) {
    if (!options.json) {
      console.log(`Uploading ${file.name}...`);
    }

    // Create direct upload
    const uploadParams: any = {
      cors_origin: "*",
      new_asset_settings: {},
    };

    // Add asset settings from flags
    if (options.playbackPolicy) {
      uploadParams.new_asset_settings.playback_policy = options.playbackPolicy;
    }
    if (options.test) {
      uploadParams.test = true;
    }
    if (options.passthrough) {
      uploadParams.new_asset_settings.passthrough = options.passthrough;
    }
    if (options.mp4Support) {
      uploadParams.new_asset_settings.mp4_support = options.mp4Support;
    }
    if (options.encodingTier) {
      uploadParams.new_asset_settings.encoding_tier = options.encodingTier;
    }
    if (options.normalizeAudio) {
      uploadParams.new_asset_settings.normalize_audio = true;
    }

    const upload = await mux.video.uploads.create(uploadParams);

    // Upload the file
    await uploadFile(file.path, upload.url, upload.id, (percent) => {
      if (!options.json && percent === 100) {
        console.log(`✓ ${file.name} uploaded`);
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
  options: CreateOptions
): Promise<any> {
  // Parse config file
  const config = await parseAssetConfig(configPath);

  // Merge with flag overrides
  if (options.playbackPolicy) {
    config.playback_policy = options.playbackPolicy;
  }
  if (options.test !== undefined) {
    config.test = options.test;
  }
  if (options.passthrough) {
    config.passthrough = options.passthrough;
  }
  if (options.mp4Support) {
    config.mp4_support = options.mp4Support;
  }
  if (options.encodingTier) {
    config.encoding_tier = options.encodingTier;
  }
  if (options.normalizeAudio !== undefined) {
    config.normalize_audio = options.normalizeAudio;
  }

  const asset = await mux.video.assets.create(config);
  return asset;
}

export const createCommand = new Command()
  .description("Create a new Mux video asset")
  .option("--url <url:string>", "Video URL to ingest from the web")
  .option("--upload <path:string>", "Local file(s) to upload (supports glob patterns)")
  .option("--file, -f <path:string>", "JSON configuration file")
  .option(
    "--playback-policy <policy:string>",
    "Playback policy (public or signed). Can be specified multiple times.",
    { collect: true }
  )
  .option("--test", "Create test asset (watermarked, 10s limit, deleted after 24h)")
  .option("--passthrough <string:string>", "User metadata (max 255 characters)")
  .option(
    "--mp4-support <option:string>",
    "MP4 support level (none, capped-1080p, audio-only, audio-only,capped-1080p)"
  )
  .option("--encoding-tier <tier:string>", "Encoding tier (smart or baseline)")
  .option("--normalize-audio", "Normalize audio loudness level")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--json", "Output JSON instead of pretty format")
  .option("--wait", "Wait for asset processing to complete")
  .action(async (options: CreateOptions) => {
    try {
      // Validate input method
      const inputMethods = [options.url, options.upload, options.file].filter(Boolean);
      if (inputMethods.length === 0) {
        throw new Error(
          "Must provide one input method: --url, --upload, or --file"
        );
      }
      if (inputMethods.length > 1) {
        throw new Error(
          "Cannot use multiple input methods. Choose one: --url, --upload, or --file"
        );
      }

      // Check authentication
      const env = await getDefaultEnvironment();
      if (!env) {
        throw new Error(
          "Not logged in. Please run 'mux login' to authenticate."
        );
      }

      // Initialize Mux client
      const mux = new Mux({
        tokenId: env.environment.tokenId,
        tokenSecret: env.environment.tokenSecret,
      });

      let result: any;

      // Execute appropriate creation method
      if (options.url) {
        result = await createFromUrl(mux, options.url, options);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`✓ Asset created: ${result.id}`);
          console.log(`  Status: ${result.status}`);
          if (result.playback_ids && result.playback_ids.length > 0) {
            console.log(`  Playback URL: https://stream.mux.com/${result.playback_ids[0].id}.m3u8`);
          }
        }
      } else if (options.upload) {
        result = await createFromUploads(mux, options.upload, options);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n✓ ${result.length} file(s) uploaded successfully`);
          for (const upload of result) {
            console.log(`  - ${upload.file}: Upload ID ${upload.uploadId}`);
          }
        }
      } else if (options.file) {
        result = await createFromConfig(mux, options.file, options);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`✓ Asset created: ${result.id}`);
          console.log(`  Status: ${result.status}`);
          if (result.playback_ids && result.playback_ids.length > 0) {
            console.log(`  Playback URL: https://stream.mux.com/${result.playback_ids[0].id}.m3u8`);
          }
        }
      }

      // Wait for asset processing if requested
      if (options.wait && result.id) {
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
            console.log("✓ Asset is ready!");
          }
        } else if (asset.status === "errored") {
          throw new Error(
            `Asset processing failed: ${asset.errors?.messages?.join(", ") || "Unknown error"}`
          );
        } else {
          if (!options.json) {
            console.log("⚠ Asset is still processing. Check status later.");
          }
        }

        if (options.json) {
          console.log(JSON.stringify(asset, null, 2));
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (options.json) {
          console.error(JSON.stringify({ error: error.message }, null, 2));
        } else {
          console.error(`Error: ${error.message}`);
        }
      }
      process.exit(1);
    }
  });
