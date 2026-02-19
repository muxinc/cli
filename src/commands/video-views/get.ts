import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific video view')
  .arguments('<view-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, viewId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const view = await mux.data.videoViews.retrieve(viewId);

      if (options.json) {
        console.log(JSON.stringify(view, null, 2));
        return;
      }

      console.log(`View ID:     ${view.data?.id ?? '-'}`);
      console.log(`Video Title: ${view.data?.video_title ?? '-'}`);
      console.log(`Watch Time:  ${view.data?.watch_time ?? 0}ms`);

      const errorCode = view.data?.player_error_code;
      const errorMessage = view.data?.player_error_message;

      if (errorCode !== undefined && errorCode !== null) {
        console.log(`Error Code:  ${errorCode}`);
      }
      if (errorMessage) {
        console.log(`Error Msg:   ${errorMessage}`);
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
