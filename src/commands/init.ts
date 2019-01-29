import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import { promisify } from 'util';
import Mux from '@mux/mux-node';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

import MuxBase from '../base';

export default class Init extends MuxBase {
  static description = 'set up a user-level config';

  Video: any;
  JWT: any;

  muxConfig: {
    tokenId?: string;
    tokenSecret?: string;
    signingKeyId?: string;
    signingKeySecret?: string;
  } = {};

  async run() {
    await this.readConfig();

    let prompts: {
      name: string;
      message: string;
      type: string;
      default?: string;
    }[] = [
      {
        name: 'tokenId',
        message: "What's your token ID?",
        type: 'string',
        default: process.env.MUX_TOKEN_ID,
      },
      {
        name: 'tokenSecret',
        message: "What's your token secret?",
        type: 'password',
        default: process.env.MUX_TOKEN_SECRET,
      },
    ];

    const signingKeyPrompt = {
      name: 'createSigningKey',
      message:
        'Do you want to go ahead and set up a Signing Key? This is used to create tokens for signed playback policies.',
      type: 'confirm',
    };

    if (process.env.MUX_SIGNING_KEY || process.env.MUX_PRIVATE_KEY) {
      signingKeyPrompt.message =
        'Looks like you already have a signing key configured. Would you like to create a new one?';
    }

    prompts = [...prompts, signingKeyPrompt];

    let { createSigningKey, tokenId, tokenSecret }: any = await inquirer.prompt(
      prompts
    );

    this.muxConfig.tokenId = process.env.MUX_TOKEN_ID = tokenId;
    this.muxConfig.tokenSecret = process.env.MUX_TOKEN_SECRET = tokenSecret;

    if (createSigningKey) {
      const { Video } = new Mux();
      try {
        const { id, private_key } = await Video.SigningKeys.create();
        this.muxConfig.signingKeyId = process.env.MUX_SIGNING_KEY = id;
        this.muxConfig.signingKeySecret = process.env.MUX_PRIVATE_KEY = private_key;
      } catch {
        this.error(
          "Couldn't create a signing key pair! Are you sure your token credentials were right?"
        );
      }
    }

    try {
      await mkdir(this.config.configDir);
    } catch {
      // We're going to assume if this fails, we're ok because it exists.
    }

    await writeFile(this.configFile, JSON.stringify(this.muxConfig), 'utf8');

    this.log(
      chalk`{bold.underline Configuration written to:} ${this.configFile}`
    );
  }
}
