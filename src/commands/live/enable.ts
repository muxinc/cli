import * as Listr from 'listr';

import LiveCommandBase from '../../command-bases/live-base';

export default class LiveEnable extends LiveCommandBase {
  static description =
    "Enables a live stream, allowing encoders to streaming to it.";

  static args = [];

  static flags = {
    ...LiveCommandBase.flags,
  }

  async run() {
    const { args, flags } = this.parse(LiveEnable);
    const streamId: string = this.getStreamId(flags);

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
      console.log("Error: ", err);
      throw err;
    }
  }
}
