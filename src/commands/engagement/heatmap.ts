import { Command } from '@cliffy/command';
import type { EngagementHeatmap } from '@mux/ts/resources/data/engagement/engagement';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { resolveTarget, type TargetOptions } from './_shared.ts';

interface HeatmapOptions extends TargetOptions {
  timeframe?: string[];
  json?: boolean;
}

export const heatmapCommand = new Command()
  .description(
    'Get the engagement heatmap (viewership across the timeline) for a video',
  )
  .option('--asset-id <assetId:string>', 'Target a Mux asset ID')
  .option('--playback-id <playbackId:string>', 'Target a Mux playback ID')
  .option(
    '--video-id <videoId:string>',
    'Target a custom video ID (video_id metadata)',
  )
  .option(
    '--timeframe <timeframe:string>',
    'Timeframe as Unix timestamps or duration (e.g., "24:hours"). Can be specified multiple times.',
    { collect: true },
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: HeatmapOptions) => {
    try {
      const target = resolveTarget(options);
      const mux = await createAuthenticatedMuxClient();

      const params =
        options.timeframe && options.timeframe.length > 0
          ? { timeframe: options.timeframe }
          : undefined;

      let response: { data: EngagementHeatmap };
      switch (target.kind) {
        case 'asset':
          response = await mux.data.engagement.assets.heatmap(
            target.id,
            params,
          );
          break;
        case 'playback-id':
          response = await mux.data.engagement.playbackIds.heatmap(
            target.id,
            params,
          );
          break;
        case 'video':
          response = await mux.data.engagement.videos.heatmap(
            target.id,
            params,
          );
          break;
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      // The SDK types declare { total_views, value } but the live API
      // currently returns { asset_id, heatmap } — accept both shapes.
      const heatmap = response.data as Partial<EngagementHeatmap> & {
        heatmap?: number[];
      };
      const values = heatmap.value ?? heatmap.heatmap ?? [];
      console.log(`Engagement heatmap for ${target.kind} ${target.id}:`);
      if (heatmap.total_views !== undefined) {
        console.log(`  Total views: ${heatmap.total_views}`);
      }
      console.log(`  Values (${values.length} buckets):`);
      console.log(`  ${JSON.stringify(values)}`);
    } catch (error) {
      await handleCommandError(error, 'engagement', 'heatmap', options);
    }
  });
