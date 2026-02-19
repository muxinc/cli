import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface CreateOptions {
  corsOrigin: string;
  playbackPolicy?: string;
  timeout?: number;
  test?: boolean;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Create a new direct upload URL for uploading video to Mux')
  .option(
    '--cors-origin <corsOrigin:string>',
    'Allowed CORS origin for the upload',
    {
      required: true,
    },
  )
  .option(
    '-p, --playback-policy <policy:string>',
    'Playback policy for the created asset (public or signed)',
    {
      value: (value: string): string => {
        if (value !== 'public' && value !== 'signed') {
          throw new Error(
            `Invalid playback policy: ${value}. Must be "public" or "signed".`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--timeout <timeout:number>',
    'Seconds before the upload times out (default: 3600)',
  )
  .option(
    '--test',
    'Create a test upload (asset will be deleted after 24 hours)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        cors_origin: options.corsOrigin,
      };

      if (options.timeout !== undefined) {
        params.timeout = options.timeout;
      }
      if (options.test) {
        params.test = true;
      }

      const newAssetSettings: Record<string, unknown> = {};
      if (options.playbackPolicy) {
        newAssetSettings.playback_policies = [options.playbackPolicy];
      }
      if (Object.keys(newAssetSettings).length > 0) {
        params.new_asset_settings = newAssetSettings;
      }

      const upload = await mux.video.uploads.create(params as never);

      if (options.json) {
        console.log(JSON.stringify(upload, null, 2));
      } else {
        console.log(`Upload created successfully`);
        console.log(`  ID: ${upload.id}`);
        console.log(`  Status: ${upload.status}`);
        console.log(`  URL: ${upload.url}`);
        console.log(`  CORS Origin: ${upload.cors_origin}`);
        console.log(`  Timeout: ${upload.timeout}s`);
        if (upload.test) {
          console.log(
            '\nWARNING: This is a test upload (asset will be deleted after 24 hours)',
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
