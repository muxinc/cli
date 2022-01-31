import * as Listr from 'listr';

import LiveCommandBase from '../../command-bases/live-base';
import chalk = require('chalk');

export default class LiveEnable extends LiveCommandBase {
  static description =
    "Enables a live stream, allowing encoders to streaming to it.";

  static args = [
    ...LiveCommandBase.argsForSingleLiveStream,
  ];

  static flags = {
    ...LiveCommandBase.flagsForSingleLiveStream,
  }

  async run() {
    const { args, flags } = this.parse(LiveEnable);
    const streamId: string = this.getStreamId(flags, args.streamName);

    try {
      await (new Listr([
        {
          title: `Enabling '${streamId}'`,
          task: async (ctx, task) => {
            await this.Video.LiveStreams.enable(streamId);
            task.title = `${task.title} (OK)`;
          },
        },
      ], {}).run());
    } catch (err) {
      // TODO: make this clearer
      console.log(
        chalk.redBright('Error:') +
        "\n\n" +
        err
      );

      if (err instanceof Error) {
        this.error(err);
      } else {
        throw err;
      }
    }
  }
}
