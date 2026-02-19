import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  assetId?: string;
  liveStreamId?: string;
  timeframe?: string[];
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List delivery usage reports')
  .option('--asset-id <assetId:string>', 'Filter by asset ID')
  .option('--live-stream-id <liveStreamId:string>', 'Filter by live stream ID')
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix timestamps or duration (e.g., "24:hours"). Can be specified multiple times.',
    { collect: true },
  )
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per report (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {
        limit: options.limit,
        page: options.page,
      };

      if (options.assetId) {
        params.asset_id = options.assetId;
      }
      if (options.liveStreamId) {
        params.live_stream_id = options.liveStreamId;
      }
      if (options.timeframe && options.timeframe.length > 0) {
        params.timeframe = options.timeframe;
      }

      const reports = await mux.video.deliveryUsage.list(params as never);

      if (options.json) {
        console.log(JSON.stringify(reports, null, 2));
        return;
      }

      const data = reports.data ?? [];

      if (data.length === 0) {
        console.log('No delivery usage reports found.');
        return;
      }

      if (options.compact) {
        for (const report of data) {
          console.log(
            `${report.asset_id}\t${report.delivered_seconds.toFixed(1)}s\t${report.asset_state}`,
          );
        }
      } else {
        for (const report of data) {
          console.log(`Asset ID: ${report.asset_id}`);
          console.log(`  State: ${report.asset_state}`);
          console.log(`  Delivered: ${report.delivered_seconds.toFixed(1)}s`);
          console.log(`  Duration: ${report.asset_duration.toFixed(1)}s`);
          if (report.asset_video_quality) {
            console.log(`  Video Quality: ${report.asset_video_quality}`);
          }
          console.log(`  Resolution Tier: ${report.asset_resolution_tier}`);
          if (report.live_stream_id) {
            console.log(`  Live Stream ID: ${report.live_stream_id}`);
          }
          console.log('');
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
