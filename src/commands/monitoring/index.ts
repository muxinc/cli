import { Command } from '@cliffy/command';
import { breakdownCommand } from './breakdown.ts';
import { breakdownTimeseriesCommand } from './breakdown-timeseries.ts';
import { dimensionsCommand } from './dimensions.ts';
import { histogramTimeseriesCommand } from './histogram-timeseries.ts';
import { metricsListCommand } from './metrics.ts';
import { timeseriesCommand } from './timeseries.ts';

export const monitoringCommand = new Command()
  .description('View real-time monitoring data from Mux Data')
  .action(function () {
    this.showHelp();
  })
  .command('dimensions', dimensionsCommand)
  .command('metrics', metricsListCommand)
  .command('breakdown', breakdownCommand)
  .command('breakdown-timeseries', breakdownTimeseriesCommand)
  .command('histogram-timeseries', histogramTimeseriesCommand)
  .command('timeseries', timeseriesCommand);
