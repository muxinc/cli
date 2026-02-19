import { Command } from '@cliffy/command';
import type Mux from '@mux/mux-node';
import { expandGlobPattern, uploadFile } from '../../lib/file-upload.ts';
import { parseAssetConfig } from '../../lib/json-config.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

// Extract types from Mux SDK
type PlaybackPolicy = Mux.PlaybackPolicy;
type VideoQuality = NonNullable<Mux.Video.AssetCreateParams['video_quality']>;
type StaticRendition = NonNullable<
  Mux.Video.AssetCreateParams['static_renditions']
>[number];

interface CreateOptions {
  url?: string;
  upload?: string[];
  file?: string;
  playbackPolicy?: string | string[];
  test?: boolean;
  passthrough?: string;
  staticRenditions?: string | string[];
  videoQuality?: string;
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
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
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
    params.playback_policies = policies as PlaybackPolicy[];
  }
  if (options.test !== undefined) {
    params.test = true;
  }
  if (options.passthrough !== undefined) {
    params.passthrough = options.passthrough;
  }
  if (options.staticRenditions !== undefined) {
    const renditions = Array.isArray(options.staticRenditions)
      ? options.staticRenditions
      : [options.staticRenditions];
    params.static_renditions = renditions.map((r) => ({
      resolution: r as StaticRendition['resolution'],
    }));
  }
  if (options.videoQuality !== undefined) {
    params.video_quality = options.videoQuality as VideoQuality;
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
  patterns: string[],
  options: CreateOptions,
): Promise<UploadResult[]> {
  // Expand glob patterns and deduplicate
  const allFiles = (await Promise.all(patterns.map(expandGlobPattern))).flat();
  const seen = new Set<string>();
  const files = allFiles.filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });

  if (files.length === 0) {
    throw new Error(`No files found matching pattern: ${patterns.join(', ')}`);
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

    const confirmed = await confirmPrompt({
      message: 'Continue with upload?',
      default: true,
    });

    if (!confirmed) {
      throw new Error('Upload cancelled by user');
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
      newAssetSettings.playback_policies = policies as PlaybackPolicy[];
    }
    if (options.passthrough !== undefined) {
      newAssetSettings.passthrough = options.passthrough;
    }
    if (options.staticRenditions !== undefined) {
      const renditions = Array.isArray(options.staticRenditions)
        ? options.staticRenditions
        : [options.staticRenditions];
      newAssetSettings.static_renditions = renditions.map((r) => ({
        resolution: r as StaticRendition['resolution'],
      }));
    }
    if (options.videoQuality !== undefined) {
      newAssetSettings.video_quality = options.videoQuality as VideoQuality;
    }
    if (options.normalizeAudio !== undefined) {
      newAssetSettings.normalize_audio = true;
    }

    const uploadParams: Mux.Video.UploadCreateParams = {
      cors_origin: '*',
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
    config.playback_policies = Array.isArray(options.playbackPolicy)
      ? options.playbackPolicy
      : [options.playbackPolicy];
  }
  if (options.test !== undefined) {
    config.test = options.test;
  }
  if (options.passthrough !== undefined) {
    config.passthrough = options.passthrough;
  }
  if (options.staticRenditions !== undefined) {
    const renditions = Array.isArray(options.staticRenditions)
      ? options.staticRenditions
      : [options.staticRenditions];
    config.static_renditions = renditions.map((r) => ({ resolution: r }));
  }
  if (options.videoQuality !== undefined) {
    config.video_quality = options.videoQuality;
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
  .description(
    'Create a Mux video asset from a URL, local file upload, or JSON config',
  )
  .option(
    '--url <url:string>',
    'Publicly accessible video URL to ingest (http/https)',
  )
  .option(
    '--upload <path:string>',
    'Local file(s) to upload (supports glob patterns). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--file, -f <path:string>',
    'JSON config file matching Mux Asset API schema (inputs, playback_policies, etc.)',
  )
  .option(
    '-p, --playback-policy <policy:string>',
    'Playback policy (public or signed). Can be specified multiple times.',
    {
      collect: true,
      value: (value: string): string => {
        const validPolicies = ['public', 'signed'];
        if (!validPolicies.includes(value)) {
          throw new Error(
            `Invalid playback policy: ${value}. Must be one of: ${validPolicies.join(', ')}`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--test',
    'Create test asset (watermarked, 10s limit, deleted after 24h)',
  )
  .option(
    '--passthrough <string:string>',
    'Arbitrary metadata stored on asset and returned in API responses (max 255 chars)',
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
    '--static-renditions <resolution:string>',
    'Static rendition resolutions (highest, audio-only, 2160p, 1440p, 1080p, 720p, 540p, 480p, 360p, 270p). Can be specified multiple times.',
    {
      collect: true,
      value: (value: string): string => {
        const validOptions = [
          'highest',
          'audio-only',
          '2160p',
          '1440p',
          '1080p',
          '720p',
          '540p',
          '480p',
          '360p',
          '270p',
        ];
        if (!validOptions.includes(value)) {
          throw new Error(
            `Invalid static-renditions value: ${value}. Must be one of: ${validOptions.join(', ')}`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--video-quality <quality:string>',
    'Video quality level: basic, plus, or premium (all support up to 4K). See https://mux.com/docs/guides/use-video-quality-levels',
    {
      value: (value: string): string => {
        const validQualities = ['basic', 'plus', 'premium'];
        if (!validQualities.includes(value)) {
          throw new Error(
            `Invalid video quality: ${value}. Must be one of: ${validQualities.join(', ')}`,
          );
        }
        return value;
      },
    },
  )
  .option('--normalize-audio', 'Normalize audio loudness level')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--wait',
    'Wait for asset processing to complete (polls up to 5 minutes)',
  )
  .arguments('[files...:string]')
  // biome-ignore lint: Cliffy infers upload as string but collect makes it string[]
  .action(async (options: any, ...args: unknown[]) => {
    const opts = options as CreateOptions;
    // Merge positional args (from shell glob expansion) into upload list
    const extraFiles = args
      .flat()
      .filter((a): a is string => typeof a === 'string');
    if (extraFiles.length > 0) {
      opts.upload = [...(opts.upload || []), ...extraFiles];
    }
    try {
      // Validate input method
      const inputMethods = [opts.url, opts.upload, opts.file].filter(Boolean);
      if (inputMethods.length === 0) {
        throw new Error(
          'Must provide one input method: --url, --upload, or --file',
        );
      }
      if (inputMethods.length > 1) {
        throw new Error(
          'Cannot use multiple input methods. Choose one: --url, --upload, or --file',
        );
      }

      // Validate inputs before authenticating
      if (opts.file) {
        await parseAssetConfig(opts.file);
      } else if (opts.upload) {
        const allFiles = (
          await Promise.all(opts.upload.map(expandGlobPattern))
        ).flat();
        if (allFiles.length === 0) {
          throw new Error(
            `No files found matching pattern: ${opts.upload.join(', ')}`,
          );
        }
      }

      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      let result: Mux.Video.Asset | UploadResult[];

      // Execute appropriate creation method
      if (opts.url) {
        result = await createFromUrl(mux, opts.url, opts);

        if (opts.json) {
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
      } else if (opts.upload) {
        result = await createFromUploads(mux, opts.upload, opts);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n${result.length} file(s) uploaded successfully`);
          for (const upload of result) {
            console.log(`  - ${upload.file}: Upload ID ${upload.uploadId}`);
          }
        }
      } else if (opts.file) {
        result = await createFromConfig(mux, opts.file, opts);

        if (opts.json) {
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
        throw new Error('No input method provided');
      }

      // Wait for asset processing if requested
      if (opts.wait && !Array.isArray(result) && result.id) {
        if (!opts.json) {
          console.log('\nWaiting for asset to be ready...');
        }

        let asset = result;
        const maxAttempts = 60; // 5 minutes with 5s intervals
        let attempts = 0;

        while (asset.status === 'preparing' && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          asset = await mux.video.assets.retrieve(result.id);
          attempts++;

          if (!opts.json) {
            process.stdout.write('.');
          }
        }

        if (!opts.json) {
          console.log();
        }

        if (asset.status === 'ready') {
          if (!opts.json) {
            console.log('Asset is ready!');
          }
        } else if (asset.status === 'errored') {
          throw new Error(
            `Asset processing failed: ${asset.errors?.messages?.join(', ') || 'Unknown error'}`,
          );
        } else {
          if (!opts.json) {
            console.log(
              `WARNING: Asset is still processing. Run 'mux assets get ${asset.id}' to check status.`,
            );
          }
        }

        if (opts.json) {
          console.log(JSON.stringify(asset, null, 2));
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (opts.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
