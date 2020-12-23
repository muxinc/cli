import { flags } from '@oclif/command';
import { IFlag } from '@oclif/command/lib/flags';

import { CommandBase } from './base';

export abstract class LiveCommandBase extends CommandBase {
  static argsForSingleLiveStream = [
    {
      name: 'streamName',
      description:
        "the name (coupled with --reference-type) to look up in Mux to yield this livestream",
      required: true,
    },
  ];

  static flagsForSingleLiveStream: Record<string, IFlag<any>> = {
    ...CommandBase.flags,
    streamId: flags.string({
      name: 'reference-type',
      char: 't',
      description: 'the type of the provided reference name',
      options: ['stream-id'],
      default: 'stream-id',
    }),
  }

  protected getStreamId(flags: Record<string, any>, streamName: string): string {
    switch (flags.streamId) {
      case 'stream-id':
        // just a pass-through
        return streamName;
    }

    throw new Error("Could not derive a stream ID. Please pass one with --stream-id.");
  }
}
