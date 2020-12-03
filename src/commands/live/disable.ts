import * as Listr from 'listr';

import LiveCommandBase from '../../command-bases/live-base';

export default class LiveDisable extends LiveCommandBase {
  static description =
    "Disables a live stream and prevents encoders from streaming to it.";

  static args = [];

  static flags = {
    ...LiveCommandBase.flags,
  }

  async run() {
    const { args, flags } = this.parse(LiveDisable);
    const streamId: string = this.getStreamId(flags);

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
      console.log("Error: ", err);
      throw err;
    }
  }
}
