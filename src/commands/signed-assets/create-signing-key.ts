import Command from '@oclif/command';
import chalk = require('chalk');

import { CommandBase } from '../../command-bases/base';
import { fetchFromConfigDir, saveConfig } from '../../config/fetcher';

export default class CreateSigningKey extends Command {
  static description =
    "Create and store a new signature key for signed Mux assets";

  static flags = {
    profile: CommandBase.flags.profile,
  };

  async run(): Promise<any> {
    const { flags } = this.parse(CreateSigningKey);
    const profileName: string = flags.profile;
    const muxConfig = await fetchFromConfigDir(this.config);

    const profile = muxConfig.profiles[profileName];

    if (!profile) {
      console.log(
        chalk`{bold.red ERROR:} no profile '{bold.yellow ${profileName}}' found.`,
      );
      this.exit(1);
    }

    const muxClient = CommandBase.buildMuxClientFromProfile(profile);

    // this is not great; we need to also update mux-node for this call
    // but that's a bigger can of worms. We'll come back to this one.
    // @ts-ignore
    const { id, private_key } = await muxClient.Video.SigningKeys.create();

    profile.signingKey = {
      keyId: id,
      keySecret: private_key,
    };

    await saveConfig(this.config, muxConfig);

    console.log(
      chalk`{bold.green OK!} Your new signing key for '{bold.yellow ${profileName}}' is good to go!`,
    );
  }
}
