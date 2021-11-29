import Mux, { Video as MuxVideo, Data as MuxData } from '@mux/mux-node';
import Command from '@oclif/command';
import * as chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

import { MuxCliConfigV1 } from '../config';

export const MUX_API_BASE_URL = "https://api.mux.com";

export default abstract class CommandBase extends Command {
  configFile = path.join(this.config.configDir, 'config.json');

  MuxConfig!: MuxCliConfigV1;
  Video!: MuxVideo;
  Data!: MuxData;
  JWT: any;

  async readConfigV1(): Promise<MuxCliConfigV1 | null> {
    try {
      await fs.access(this.configFile, fs.constants.F_OK);
    } catch(err) {
      return null;
    }

    try {
      const configRaw = await fs.readJSON(this.configFile);

      // Mux SDK configuration options
      configRaw.tokenId = process.env.MUX_TOKEN_ID ?? configRaw.tokenId;
      configRaw.tokenSecret = process.env.MUX_TOKEN_SECRET ?? configRaw.tokenSecret;
      configRaw.signingKeyId = process.env.MUX_SIGNING_KEY ?? configRaw.signingKeyId;
      configRaw.signingKeySecret = process.env.MUX_PRIVATE_KEY ?? configRaw.signingKeySecret;

      // Mux CLI specific configuration options
      configRaw.configVersion = configRaw.configVersion ?? 1;
      configRaw.baseUrl = process.env.MUX_CLI_BASE_URL ?? configRaw.baseUrl ?? MUX_API_BASE_URL;

      return MuxCliConfigV1.check(configRaw);
    } catch (err) {
      this.error(err);
    }
  }

  async init() {
    try {
      const config = await this.readConfigV1();
      const { Video, Data } = new Mux(config?.tokenId, config?.tokenSecret, {
        baseUrl: config?.baseUrl,
      });

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
}
