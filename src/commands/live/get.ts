import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { formatLiveStream } from '@/lib/formatters.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific Mux live stream')
  .arguments('<stream-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, streamId: string) => {
    try {
      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Fetch live stream details
      const stream = await mux.video.liveStreams.retrieve(streamId);

      if (options.json) {
        console.log(JSON.stringify(stream, null, 2));
      } else {
        formatLiveStream(stream);
      }
    } catch (error) {
      await handleCommandError(error, 'live', 'get', options);
    }
  });
