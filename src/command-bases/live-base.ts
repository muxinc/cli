import { flags } from '@oclif/command';

import CommandBase from './base';

export default abstract class LiveCommandBase extends CommandBase {
  static flags = {
    streamId: flags.string({
      name: 'stream-id',
      char: 'i',
      description: 'The live stream, by its stream id',
      required: true,
    }),
  }

  protected getStreamId(flags: Record<string, any>): string {
    if (flags.streamId) {
      return flags.streamId;
    }

    throw new Error("Could not derive a stream ID. Please pass one with --stream-id.");
  }
}
