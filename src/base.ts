import * as Mux from '@mux/mux-node';
import Command from '@oclif/command';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
const readFile = promisify(fs.readFile);

export default abstract class MuxCommand extends Command {
  configFile = path.join(this.config.configDir, 'config.json');

  Video: any;
  JWT: any;

  async readConfig() {
    try {
      const configFile = await readFile(this.configFile, 'utf8');
      const config = JSON.parse(configFile);

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
      } else if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
        this.log(
          chalk`{bold.underline.red No Mux config file found!} If you'd like to create one, run the {bold.magenta init} command. Otherwise, make sure to have the {bold.yellow MUX_TOKEN_ID} and {bold.yellow MUX_TOKEN_SECRET} environment variables set.`
        );
      }

      return null;
    }
  }

  async init() {
    await this.readConfig();

    const { Video } = new Mux();

    this.Video = Video;
    this.JWT = Mux.JWT;
  }
}
