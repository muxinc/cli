import Mux, { Video as MuxVideo } from '@mux/mux-node';
import Command from '@oclif/command';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

export default abstract class MuxCommand extends Command {
  configFile = path.join(this.config.configDir, 'config.json');

  Video!: MuxVideo;
  JWT: any;

  async readConfig() {
    try {
      const config = await fs.readJSON(this.configFile);

      process.env.MUX_TOKEN_ID = process.env.MUX_TOKEN_ID || config.tokenId;
      process.env.MUX_TOKEN_SECRET =
        process.env.MUX_TOKEN_SECRET || config.tokenSecret;

      process.env.MUX_SIGNING_KEY =
        process.env.MUX_SIGNING_KEY || config.signingKeyId;
      process.env.MUX_PRIVATE_KEY =
        process.env.MUX_PRIVATE_KEY || config.signingKeySecret;

      return config;
    } catch (err) {
      if (err.errno !== -2) {
        this.error(err);
      }

      return null;
    }
  }

  async init() {
    await this.readConfig();

    try {
      const { Video } = new Mux();

      this.Video = Video;
      this.JWT = Mux.JWT;
    } catch {
      if (this.id === 'init') return; // If we're initing we're trying to fix this, so don't yell :)

      this.log(
        chalk`{bold.underline.red No Mux config file found!} If you'd like to create one, run the {bold.magenta init} command. Otherwise, make sure to have the {bold.yellow MUX_TOKEN_ID} and {bold.yellow MUX_TOKEN_SECRET} environment variables set. 👋`
      );
    }
  }
}
