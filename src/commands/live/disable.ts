import * as Listr from 'listr';

import LiveCommandBase from '../../command-bases/live-base';
import chalk = require('chalk');

export default class LiveDisable extends LiveCommandBase {
  static description =
    "Disables a live stream and prevents encoders from streaming to it.";

  static args = [
    ...LiveCommandBase.argsForSingleLiveStream,
  ];

  static flags = {
    ...LiveCommandBase.flagsForSingleLiveStream,
  }

  async run() {
    const { args, flags } = this.parse(LiveDisable);
    const streamId: string = this.getStreamId(flags, args.streamName);

    try {
      await (new Listr([
        {
          title: `Disabling '${streamId}'`,
          task: async (ctx, task) => {
            await this.Video.LiveStreams.disable(streamId);
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
      this.error(err);
    }
  }
}
