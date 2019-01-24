import chalk from 'chalk';
import * as clipboard from 'clipboardy';
import * as fs from 'fs';
import * as Listr from 'listr';
import * as path from 'path';
import * as request from 'request';

import Command from './base';

export default class AssetsCreate extends Command {
  static description = 'Create a new asset in Mux via a local file';

  static args = [
    {
      name: 'path',
      description:
        "local path for the file you'd like to create this asset from",
      required: true,
    },
  ];

  uploadFile(filePath: string, url: string) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.resolve(__dirname, filePath)).pipe(
        request
          .put(url)
          .on('response', resolve)
          .on('error', reject)
      );
    });
  }

  pollUpload(uploadId: string): Promise<IMuxUpload> {
    return new Promise((resolve, reject) => {
      const poll = () =>
        setTimeout(async () => {
          try {
            const upload = await this.Video.Uploads.get(uploadId);
            if (upload.status === 'asset_created') {
              return resolve(upload);
            } else if (upload.status === 'errored') {
              return reject(upload);
            }

            poll();
          } catch (err) {
            reject(err);
          }
        }, 500);

      poll();
    });
  }

  async run() {
    const { args, flags } = this.parse(AssetsCreate);

    let assetBodyParams: IMuxUploadBody = {
      new_asset_settings: {
        playback_policies: flags.private ? ['signed'] : ['public'],
      },
    };

    const tasks = new Listr([
      {
        title: 'Creating Mux Direct Upload',
        task: async ctx => {
          const upload = await this.Video.Uploads.create(assetBodyParams);
          ctx.upload = upload;
        },
      },
      {
        title: 'Uploading file',
        task: async ctx => {
          await this.uploadFile(args.path, ctx.upload.url);
        },
      },
      {
        title: 'Waiting for asset to be playable',
        task: async ctx => {
          const { asset_id } = await this.pollUpload(ctx.upload.id);
          const asset = await this.pollAsset(asset_id);
          ctx.asset = asset;
        },
      },
    ]);

    tasks.run().then(async ctx => {
      const playbackUrl = this.playbackUrl(ctx.asset);

      await clipboard.write(playbackUrl);

      this.log(
        chalk`
📹 {bold.underline Asset ready for your enjoyment:}
${playbackUrl}
`
      );
    });
  }
}
