import { flags } from '@oclif/command';
import chalk from 'chalk';
import * as clipboard from 'clipboardy';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as Listr from 'listr';
import * as path from 'path';
import * as request from 'request';

import Command from '../../assets-base';

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

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      description:
        'regex that filters the selected destination if the provided path is a folder',
    }),
    concurrent: flags.integer({
      char: 'c',
      description: 'max number of files to upload at once',
      default: 3,
    }),
  };

  getFilePaths(filePath: string, filter = '') {
    if (fs.lstatSync(filePath).isDirectory()) {
      return fs.readdirSync(filePath).filter(file => file.match(filter));
    }

    return [filePath];
  }

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

    const regex = new RegExp(flags.filter || '', 'ig');
    const files = this.getFilePaths(path.resolve(__dirname, args.path)).filter(
      file => file.match(regex)
    );

    let prompt;
    if (files.length === 0) {
      return this.log(
        `We were unable to find any files. You might want to double check your path or make sure your filter isn't too strict`
      );
    } else if (files.length > 1) {
      prompt = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'files',
          message: 'We found a few files! Do all of these look good?',
          choices: files,
          default: files,
        },
      ]);
    }

    const tasks: Listr.ListrTask[] = prompt.files.map((file: string) => ({
      title: `${file}: getting direct upload URL`,
      task: async (ctx: any, task: Listr.ListrTask) => {
        const upload = await this.Video.Uploads.create(assetBodyParams);

        task.title = `${file}: uploading`;
        await this.uploadFile(
          path.resolve(__dirname, args.path, file),
          upload.url
        );

        task.title = `${file}: waiting for asset to be playable`;
        const { asset_id } = await this.pollUpload(upload.id);
        const asset = await this.pollAsset(asset_id);

        const playbackUrl = this.playbackUrl(asset);
        task.title = `${file}: ${playbackUrl}`;
        ctx.assets = [
          ...(ctx.assets || [['Filename', 'Asset ID', 'PlaybackURL']]),
          [file, asset.id, playbackUrl],
        ];
      },
    }));

    const finalCtx = await new Listr(tasks, {
      concurrent: flags.concurrent,
    }).run();

    if (prompt.files.length > 1) {
      await clipboard.write(
        finalCtx.assets.map((row: string[]) => row.join('\t')).join('\n')
      );

      return this.log(
        chalk`
📹 {bold.underline Assets ready for your enjoyment:}
${finalCtx.assets}

{blue (copied to your clipboard as a CSV)}`
      );
    }

    await clipboard.write(finalCtx.assets[1][2]);
    return this.log(
      chalk`
📹 {bold.underline Asset ready for your enjoyment:}
${finalCtx.assets}

{blue (since you only uploaded one asset, we just added the playback URL to your clipboard.)}`
    );
  }
}
