import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface HistogramTimeseriesOptions {
  json?: boolean;
  filters?: string[];
}

export const histogramTimeseriesCommand = new Command()
  .description('Get monitoring histogram timeseries for video startup time')
  .option('--json', 'Output JSON instead of pretty format')
  .option(
    '--filters <filter:string>',
    'Filter results (e.g., "country:US"). Can be specified multiple times.',
    { collect: true },
  )
  .action(async (options: HistogramTimeseriesOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: Record<string, unknown> = {};

      if (options.filters && options.filters.length > 0) {
        params.filters = options.filters;
      }

      const response = await mux.data.monitoring.metrics.getHistogramTimeseries(
        'video-startup-time',
        params as never,
      );

      if (wantsJson(options)) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const data = response.data ?? [];

      if (data.length === 0) {
        console.log('No histogram timeseries data found.');
        return;
      }

      for (const point of data) {
        console.log(`Timestamp: ${point.timestamp ?? '-'}`);
        console.log(`Average:   ${point.average ?? '-'}`);
        console.log(`Median:    ${point.median ?? '-'}`);
        console.log(`P95:       ${point.p95 ?? '-'}`);
        console.log('');
      }
    } catch (error) {
      await handleCommandError(
        error,
        'monitoring',
        'histogram-timeseries',
        options,
      );
    }
  });
