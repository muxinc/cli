import { Command } from '@cliffy/command';
import { breakdownCommand } from './breakdown.ts';
import { insightsCommand } from './insights.ts';
import { listCommand } from './list.ts';
import { overallCommand } from './overall.ts';
import { timeseriesCommand } from './timeseries.ts';

export const metricsCommand = new Command()
  .description('View metric analytics from Mux Data')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('breakdown', breakdownCommand)
  .command('overall', overallCommand)
  .command('timeseries', timeseriesCommand)
  .command('insights', insightsCommand);
