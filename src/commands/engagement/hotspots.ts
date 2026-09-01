import { Command } from '@cliffy/command';
import type { EngagementHotspots } from '@mux/ts/resources/data/engagement/engagement';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { formatMs, resolveTarget, type TargetOptions } from './_shared.ts';

interface HotspotsOptions extends TargetOptions {
  limit?: number;
  orderDirection?: 'asc' | 'desc';
  timeframe?: string[];
  json?: boolean;
}

export const hotspotsCommand = new Command()
  .description('Get the most-watched moments (engagement hotspots) for a video')
  .option('--asset-id <assetId:string>', 'Target a Mux asset ID')
  .option('--playback-id <playbackId:string>', 'Target a Mux playback ID')
  .option(
    '--video-id <videoId:string>',
    'Target a custom video ID (video_id metadata)',
  )
  .option('--limit <limit:number>', 'Maximum number of hotspots to return')
  .option(
    '--order-direction <orderDirection:string>',
    'Sort order (asc or desc)',
    {
      value: (value: string): 'asc' | 'desc' => {
        if (value !== 'asc' && value !== 'desc') {
          throw new Error(
            `Invalid --order-direction: ${value}. Must be "asc" or "desc".`,
          );
        }
        return value;
      },
    },
  )
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix timestamps or duration (e.g., "24:hours"). Can be specified multiple times.',
    { collect: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: HotspotsOptions) => {
    try {
      const target = resolveTarget(options);
      const mux = await createAuthenticatedMuxClient();

      const params: {
        limit?: number;
        order_direction?: 'asc' | 'desc';
        timeframe?: string[];
      } = {};
      if (options.limit !== undefined) params.limit = options.limit;
      if (options.orderDirection !== undefined)
        params.order_direction = options.orderDirection;
      if (options.timeframe && options.timeframe.length > 0)
        params.timeframe = options.timeframe;

      let response: { data: EngagementHotspots };
      switch (target.kind) {
        case 'asset':
          response = await mux.data.engagement.assets.hotspots(
            target.id,
            params,
          );
          break;
        case 'playback-id':
          response = await mux.data.engagement.playbackIds.hotspots(
            target.id,
            params,
          );
          break;
        case 'video':
          response = await mux.data.engagement.videos.hotspots(
            target.id,
            params,
          );
          break;
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const { hotspots, total_views } = response.data;
      console.log(`Engagement hotspots for ${target.kind} ${target.id}:`);
      console.log(`  Total views: ${total_views}`);

      if (hotspots.length === 0) {
        console.log('  No hotspots found.');
        return;
      }

      for (const hotspot of hotspots) {
        const range = `${formatMs(hotspot.start_ms)} - ${formatMs(hotspot.end_ms)}`;
        console.log(`  ${range.padEnd(16)} score: ${hotspot.score}`);
      }
    } catch (error) {
      await handleCommandError(error, 'engagement', 'hotspots', options);
    }
  });
