import Mux, { Video as MuxVideo, Data as MuxData, JWT as MuxJWT } from '@mux/mux-node';
import Command from '@oclif/command';
import * as chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

import { MuxCliConfigV1 } from '../config';

export const MUX_API_BASE_URL = "https://api.mux.com";

export default abstract class CommandBase extends Command {
  configFile = path.join(this.config.configDir, 'config.json');

  MuxConfig!: MuxCliConfigV1;
  Mux!: Mux;
  Video!: MuxVideo;
  Data!: MuxData;
  JWT!: typeof MuxJWT;

  async readConfigV1(): Promise<MuxCliConfigV1> {
    const configAlreadyExists = await fs.pathExists(this.configFile);
    try {
      const configRaw =
        configAlreadyExists
          ? await fs.readJSON(this.configFile)
          : {};

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
      if (configAlreadyExists) {
        // we have a bad config file, and should say so
        this.log(
          chalk`{bold.underline.red Invalid Mux configuration file found at {bold.underline.cyan ${this.configFile}}:}\n\n` +
          Object.entries((err as any).details).map(tup => " - " + chalk`{cyan ${tup[0]}}` + `: ${tup[1]}`) +
          chalk`\n\nPlease fix the file or run {bold.magenta mux init --force} to create a new one.`
        )
      } else {
        this.log(
          chalk`{bold.underline.red No Mux configuration file found!} If you'd like to create ` +
          chalk`one, run the {bold.magenta init} command. Otherwise, make sure to have the ` +
          chalk`{bold.yellow MUX_TOKEN_ID} and {bold.yellow MUX_TOKEN_SECRET} environment variables set. 👋`
        );
      }

      process.exit(1);
    }
  }

  async init() {
    if (this.id === 'init') return; // If we're initing we don't want any of this!

    const config = await this.readConfigV1();
    const mux = new Mux(config?.tokenId, config?.tokenSecret, {
      baseUrl: config?.baseUrl,
    });

    this.Mux = mux;
    this.MuxConfig = config;
    this.Video = this.Mux.Video;
    this.Data = this.Mux.Data;
    this.JWT = Mux.JWT;
  }
}
