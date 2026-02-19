import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

interface CreateOptions {
  url: string;
  streamKey?: string;
  passthrough?: string;
  json?: boolean;
}

export const createCommand = new Command()
  .description('Create a simulcast target for a live stream')
  .arguments('<stream-id:string>')
  .option('--url <url:string>', 'RTMP URL to simulcast to', { required: true })
  .option(
    '--stream-key <streamKey:string>',
    'Stream key for the simulcast target',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CreateOptions, streamId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: {
        url: string;
        stream_key?: string;
        passthrough?: string;
      } = {
        url: options.url,
      };

      if (options.streamKey !== undefined) {
        params.stream_key = options.streamKey;
      }
      if (options.passthrough !== undefined) {
        params.passthrough = options.passthrough;
      }

      const target = await mux.video.liveStreams.createSimulcastTarget(
        streamId,
        params,
      );

      if (options.json) {
        console.log(JSON.stringify(target, null, 2));
      } else {
        console.log(`Simulcast target created successfully`);
        console.log(`  ID: ${target.id}`);
        console.log(`  URL: ${target.url}`);
        if (target.passthrough) {
          console.log(`  Passthrough: ${target.passthrough}`);
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
