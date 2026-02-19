import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific direct upload')
  .arguments('<upload-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, uploadId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const upload = await mux.video.uploads.retrieve(uploadId);

      if (options.json) {
        console.log(JSON.stringify(upload, null, 2));
      } else {
        console.log(`Upload ID: ${upload.id}`);
        console.log(`Status: ${upload.status}`);
        console.log(`URL: ${upload.url}`);
        console.log(`CORS Origin: ${upload.cors_origin}`);
        console.log(`Timeout: ${upload.timeout}s`);
        if (upload.asset_id) {
          console.log(`Asset ID: ${upload.asset_id}`);
        }
        if (upload.error) {
          console.log(`Error: ${upload.error.message ?? upload.error.type}`);
        }
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
