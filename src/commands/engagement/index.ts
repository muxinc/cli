import { Command } from '@cliffy/command';
import { heatmapCommand } from './heatmap.ts';
import { hotspotsCommand } from './hotspots.ts';

export const engagementCommand = new Command()
  .description('Explore engagement analytics for your videos (Mux Data)')
  .action(function () {
    this.showHelp();
  })
  .command('heatmap', heatmapCommand)
  .command('hotspots', hotspotsCommand);
