import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

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

      if (wantsJson(options)) {
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
      await handleCommandError(error, 'video-views', 'get', options);
    }
  });
