import Mux, { Video as MuxVideo, Data as MuxData, JWT as MuxJWT } from '@mux/mux-node';
import Command, { flags } from '@oclif/command';
import * as chalk from 'chalk';
import { serializeError } from 'serialize-error';

import { MuxCliConfigProfileLatest } from '../config';
import { fetchProfile } from '../config/fetcher';
import { IFlag } from '@oclif/command/lib/flags';
import { inspect } from 'util';

export abstract class CommandBase extends Command {
  MuxProfile!: MuxCliConfigProfileLatest | null;
  Video!: MuxVideo;
  Data!: MuxData;

  static flags: Record<string, IFlag<any>> = {
    profile: flags.string({
      char: 'p',
      default: process.env.MUX_CLI_ENV ?? 'default',
    }),
  };

  async readProfile(): Promise<MuxCliConfigProfileLatest | null> {
    const { flags } = this.parse(this.constructor as any);

    return fetchProfile({
      oclifConfig: this.config,
      currentProfile: (flags as any).profile,
    });
  }

  async init() {
    this.MuxProfile = await this.readProfile();

    const { Video, Data } =
      this.MuxProfile
        ? CommandBase.buildMuxClientFromProfile(this.MuxProfile)
        : new Mux();

    this.Video = Video;
    this.Data = Data;
  }

  protected printErrorAndDie(err: unknown) {
    console.log(
      chalk.redBright(`Error in ${this.constructor.name}:`) +
      "\n\n" +
      inspect(serializeError(err), false, null, true),
    );

    this.exit(1)
  }

  static buildMuxClientFromProfile(profile: MuxCliConfigProfileLatest): Mux {
    return new Mux(profile.tokenId, profile.tokenSecret, { baseUrl: profile.baseUrl ?? 'https://api.mux.com' });
  }
}
