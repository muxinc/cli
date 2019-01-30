import chalk from 'chalk';
import * as clipboard from 'clipboardy';
import * as Listr from 'listr';

import MuxBase from '../../assets-base';

export default class AssetsCreate extends MuxBase {
  static description =
    "Create a new asset in Mux using a file that's already available online";

  static args = [
    {
      name: 'input',
      description:
        "input URL for the file you'd like to create this asset from",
      required: true,
    },
  ];

  async run() {
    const { args, flags } = this.parse(AssetsCreate);
    let assetBodyParams: IMuxAssetBody = {
      input: args.input,
      playback_policies: flags.private ? ['signed'] : ['public'],
    };

    const tasks = new Listr([
      {
        title: 'Creating Mux Asset',
        task: async ctx => {
          const asset = await this.Video.Assets.create(assetBodyParams);
          ctx.asset = asset;
        },
      },
      {
        title: 'Waiting for asset to be playable',
        task: async ctx => {
          const asset = await this.pollAsset(ctx.asset.id);
          ctx.asset = asset;
        },
      },
    ]);

    tasks.run().then(async ctx => {
      const playbackUrl = this.playbackUrl(ctx.asset);
      await clipboard.write(playbackUrl);

      this.log(
        chalk`
💫 {bold.blue Asset ready for your enjoyment!}

{bold.underline Playback URL}
${playbackUrl}
`
      );
    });
  }
}
