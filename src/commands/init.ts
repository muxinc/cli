import Mux from '@mux/mux-node';
import { flags } from '@oclif/command';
import * as Parser from '@oclif/parser';
import * as chalk from 'chalk';
import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import * as inquirer from 'inquirer';
import * as path from 'path';

import MuxBase from '../command-bases/base';
import { MuxCliConfigV1 } from '../config';

export type InitFlags = {
  force: Parser.flags.IBooleanFlag<boolean>;
};

export default class Init extends MuxBase {
  static description = 'set up a user-level config';

  static args = [
    {
      name: 'envFile',
      required: false,
      description: 'path to a Mux access token .env file',
      parse: (input: string) => path.resolve(input),
    },
  ];

  static flags: InitFlags = {
    force: flags.boolean({
      name: 'force',
      char: 'f',
      description: 'Will initialize a new file even if one already exists.',
      default: false,
    }),
  };

  Video: any;
  JWT: any;

  muxConfig: Partial<MuxCliConfigV1> = {};

  async run() {
    const { args, flags } = this.parse(Init);

    let prompts: {
      name: string;
      message: string;
      type: string;
      default?: string;
    }[] = [];

    if (args.envFile) {
      const envFile = path.resolve(args.envFile);
      const env = dotenv.config({ path: envFile });
      if (env.error) {
        this.error(`Unable to load env file: ${envFile}`);
      } else if (env.parsed) {
        this.log(
          chalk`Loaded your Mux .env file! Using token with id: {blue ${
            env.parsed.MUX_TOKEN_ID
          }}`
        );
        process.env.MUX_TOKEN_ID = env.parsed.MUX_TOKEN_ID;
        process.env.MUX_TOKEN_SECRET = env.parsed.MUX_TOKEN_SECRET;
      }
    } else {
      prompts = [
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
    }

    if (!flags.force && (await fs.pathExists(this.configFile))) {
      this.log(
        chalk`{bold.underline.red You are attempting to initialize with an existing configuration file!} If this is intentional, please pass {bold.yellow --force}.`
      );
      process.exit(1);
    }

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

    const answers = await inquirer.prompt(prompts);
    let { createSigningKey, tokenId, tokenSecret }: any = answers;

    // If the token was loaded from an env file they'll already be set in the appropriate environment variables and
    // the prompts themselves will be null.
    this.muxConfig.configVersion = 1;
    this.muxConfig.tokenId = process.env.MUX_TOKEN_ID = tokenId || process.env.MUX_TOKEN_ID;
    this.muxConfig.tokenSecret = process.env.MUX_TOKEN_SECRET = tokenSecret || process.env.MUX_TOKEN_SECRET;

    if (createSigningKey) {
      const { Video } = new Mux();
      try {
        // this is not great; we need to also update mux-node for this call
        // but that's a bigger can of worms. We'll come back to this one.
        // @ts-ignore
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
      await fs.ensureDir(this.config.configDir);
      await fs.writeFile(
        this.configFile,
        JSON.stringify(this.muxConfig),
        'utf8'
      );
    } catch (err) {
      // TODO: improve error handling type safety here
      if (err instanceof Error) {
        this.error(err);
      } else {
        throw err;
      }
    }

    this.log(
      chalk`{bold.underline Configuration written to:} ${this.configFile}`
    );
  }
}
