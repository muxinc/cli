import Mux, { Video as MuxVideo, Data as MuxData, JWT as MuxJWT } from '@mux/mux-node';
import Command, { flags } from '@oclif/command';
import * as chalk from 'chalk';

import { MuxCliConfigProfileLatest } from '../config';
import { fetchProfile } from '../config/fetcher';
import { IFlag } from '@oclif/command/lib/flags';

export abstract class CommandBase extends Command {
  MuxProfile!: MuxCliConfigProfileLatest | null;
  Video!: MuxVideo;
  Data!: MuxData;
  JWT!: MuxJWT;

  static flags: Record<string, IFlag<any>> = {
    profile: flags.string({
      char: 'p',
      default: process.env.MUX_CLI_ENV ?? 'default',
    }),
  };

  async readProfile(): Promise<MuxCliConfigProfileLatest | null> {
    const { flags } = this.parse(this.constructor as any);

    console.log("PROFILE TO FETCH:");
    return fetchProfile({
      oclifConfig: this.config,
      currentProfile: (flags as any).profile,
    });
  }

  async init() {
    try {
      this.MuxProfile = await this.readProfile();

      const { Video, Data } =
        this.MuxProfile
          ? CommandBase.buildMuxClientFromProfile(this.MuxProfile)
          : new Mux();

      this.Video = Video;
      this.Data = Data;
      this.JWT = Mux.JWT;
    } catch {
      if (this.id === 'init') return; // If we're initing we're trying to fix this, so don't yell :)

      this.log(
        chalk`{bold.underline.red No Mux config file found!} If you'd like to create one, run the {bold.magenta init} command. Otherwise, make sure to have the {bold.yellow MUX_TOKEN_ID} and {bold.yellow MUX_TOKEN_SECRET} environment variables set. 👋`
      );
    }
  }

  static buildMuxClientFromProfile(profile: MuxCliConfigProfileLatest): Mux {
    return new Mux(profile.tokenId, profile.tokenSecret, { baseUrl: profile.baseUrl });
  }
}
