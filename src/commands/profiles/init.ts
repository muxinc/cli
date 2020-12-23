import Command from '@oclif/command';

import { CommandBase } from '../../command-bases/base';
import { fetchFromConfigDir, saveConfig } from '../../config/fetcher';
import chalk = require('chalk');
import inquirer = require('inquirer');
import Mux from '@mux/mux-node';

export default class InitProfile extends Command {
  static description =
    "Create a new profile to encapsulate a set of credentials + settings";

  static aliases = ['init'];

  static flags = {
    profile: CommandBase.flags.profile,
  };

  async run(): Promise<any> {
    const { flags } = this.parse(InitProfile);
    const profileName: string = flags.profile;
    const muxConfig = await fetchFromConfigDir(this.config);

    if (muxConfig.profiles[profileName]) {
      console.log(chalk`{bold.red ERROR:} profile '{bold.yellow ${profileName}}' already exists.`);
      this.exit(1);
    }

    const answers = await inquirer.prompt([
      {
        name: 'tokenId',
        message: "What's your token ID?",
        type: 'string',
      },
      {
        name: 'tokenSecret',
        message: "What's your token secret?",
        type: 'password',
      },
    ]);

    const tokenId: string = answers.tokenId;
    const tokenSecret: string = answers.tokenSecret;

    // TODO: check for token validity? we'd need a meta endpoint to do it well.
    muxConfig.profiles[profileName] = {
      tokenId,
      tokenSecret,

      signingKey: undefined,

      baseUrl: undefined,
    };

    await saveConfig(this.config, muxConfig);

    console.log(
      chalk`{bold.green OK!} Your new profile '{bold.yellow ${profileName}}' is good to go!`,
    );
    console.log(
      chalk`{bold.cyan NOTICE:} Unlike earlier versions of the CLI, if you need
        a signing key, you will need to run '{bold.yellow mux sign:create-key}'.'`,
    );
  }
}
