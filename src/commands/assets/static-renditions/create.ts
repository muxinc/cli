import { Command } from '@cliffy/command';
import type Mux from '@mux/mux-node';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

type Resolution = NonNullable<
  Mux.Video.AssetCreateStaticRenditionParams['resolution']
>;

const VALID_RESOLUTIONS: Resolution[] = [
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

interface CreateOptions {
  resolution: Resolution;
  passthrough?: string;
  wait?: boolean;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Create a static rendition for an asset')
  .arguments('<asset-id:string>')
  .option(
    '-r, --resolution <resolution:string>',
    'Target resolution (highest, audio-only, 2160p, 1440p, 1080p, 720p, 540p, 480p, 360p, 270p)',
    {
      required: true,
      value: (value: string): Resolution => {
        if (!VALID_RESOLUTIONS.includes(value as Resolution)) {
          throw new Error(
            `Invalid resolution: ${value}. Must be one of: ${VALID_RESOLUTIONS.join(', ')}`,
          );
        }
        return value as Resolution;
      },
    },
  )
  .option(
    '-p, --passthrough <passthrough:string>',
    'Custom metadata for the rendition (max 255 characters)',
  )
  .option(
    '-w, --wait',
    'Wait for the rendition to be ready instead of returning immediately',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Mux.Video.AssetCreateStaticRenditionParams = {
        resolution: options.resolution,
      };

      if (options.passthrough) {
        if (options.passthrough.length > 255) {
          throw new Error('Passthrough value must be 255 characters or less');
        }
        params.passthrough = options.passthrough;
      }

      const rendition = await mux.video.assets.createStaticRendition(
        assetId,
        params,
      );

      if (options.wait && rendition.status === 'preparing') {
        const finalRendition = await pollForRendition(
          mux,
          assetId,
          rendition.id as string,
          options.json,
        );
        outputRendition(finalRendition, options.json, false);
      } else {
        outputRendition(rendition, options.json, !options.wait);
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

async function pollForRendition(
  mux: Mux,
  assetId: string,
  renditionId: string,
  jsonOutput?: boolean,
): Promise<Mux.Video.AssetCreateStaticRenditionResponse> {
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes
  const startTime = Date.now();

  if (!jsonOutput) {
    process.stdout.write('Waiting for rendition to be ready');
  }

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const asset = await mux.video.assets.retrieve(assetId);
    const files = asset.static_renditions?.files ?? [];
    const rendition = files.find((f) => f.id === renditionId);

    if (rendition) {
      if (rendition.status === 'ready') {
        if (!jsonOutput) {
          console.log(' done!');
        }
        return rendition as Mux.Video.AssetCreateStaticRenditionResponse;
      }
      if (rendition.status === 'errored') {
        if (!jsonOutput) {
          console.log(' failed!');
        }
        return rendition as Mux.Video.AssetCreateStaticRenditionResponse;
      }
      if (rendition.status === 'skipped') {
        if (!jsonOutput) {
          console.log(' skipped!');
        }
        return rendition as Mux.Video.AssetCreateStaticRenditionResponse;
      }
    }

    if (!jsonOutput) {
      process.stdout.write('.');
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for rendition to be ready');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outputRendition(
  rendition: Mux.Video.AssetCreateStaticRenditionResponse,
  jsonOutput?: boolean,
  showAsyncMessage?: boolean,
) {
  if (jsonOutput) {
    console.log(JSON.stringify(rendition, null, 2));
  } else {
    console.log(`Static rendition created:`);
    console.log(`  ID: ${rendition.id}`);
    console.log(`  Name: ${rendition.name}`);
    console.log(`  Resolution: ${rendition.resolution}`);
    console.log(`  Status: ${rendition.status}`);

    if (rendition.width && rendition.height) {
      console.log(`  Dimensions: ${rendition.width}x${rendition.height}`);
    }
    if (rendition.bitrate) {
      console.log(`  Bitrate: ${formatBitrate(rendition.bitrate)}`);
    }
    if (rendition.filesize) {
      console.log(`  Size: ${formatFilesize(rendition.filesize)}`);
    }
    if (rendition.passthrough) {
      console.log(`  Passthrough: ${rendition.passthrough}`);
    }

    if (showAsyncMessage && rendition.status === 'preparing') {
      console.log(
        '\nNote: Static rendition generation is asynchronous. ' +
          "Use 'mux assets static-renditions list <asset-id>' to check the status, " +
          'or use the --wait flag to poll until ready.',
      );
    }
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
