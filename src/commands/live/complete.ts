import * as Listr from 'listr';
import { flags } from '@oclif/command';
import { IFlag } from '@oclif/command/lib/flags';

import LiveCommandBase from '../../command-bases/live-base';

export default class LiveComplete extends LiveCommandBase {
  static description =
    "Signal to Mux that a live stream has concluded and should be closed.";

  static args = [
    ...LiveCommandBase.argsForSingleLiveStream,
  ];

  static flags: Record<string, IFlag<any>> = {
    ...LiveCommandBase.flagsForSingleLiveStream,
    disableAfterCompletion: flags.boolean({
      name: 'disable-after-completion',
      char: 'd',
      description: 'If set, disables the stream upon completion.',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = this.parse(LiveComplete);
    const streamId: string = this.getStreamId(flags, args.streamName);

    try {
      await (new Listr([
        {
          title: `Signaling completion of '${streamId}'`,
          task: async (ctx, task) => {
            await this.Video.LiveStreams.signalComplete(streamId),
            task.title = `${task.title} (OK)`;
          },
        },
        {
          title: `Disabling '${streamId}'`,
          enabled: () => flags.disableAfterCompletion,
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
