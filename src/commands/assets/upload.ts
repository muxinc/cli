import { CreateUploadParams, Upload } from '@mux/mux-node';
import { flags } from '@oclif/command';
import * as chalk from 'chalk';
import * as clipboard from 'clipboardy';
import * as fs from 'fs-extra';
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
      description: "local path for the file (or folder) you'd like to upload",
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
      fs.createReadStream(path.resolve(process.cwd(), filePath)).pipe(
        request
          .put(url)
          .on('response', resolve)
          .on('error', reject)
      );
    });
  }

  pollUpload(uploadId: string): Promise<Upload> {
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

    let assetBodyParams: CreateUploadParams = {
      new_asset_settings: {
        playback_policy: flags.private ? ['signed'] : ['public'],
      },
    };

    const regex = new RegExp(flags.filter || '', 'ig');
    const files = this.getFilePaths(
      path.resolve(process.cwd(), args.path)
    ).filter(file => file.match(regex));

    let prompt = { files };
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

    const tasks = prompt.files.map((file: string) => ({
      title: `${file}: getting direct upload URL`,
      task: async (ctx: any, task: Listr.ListrTask) => {
        const upload = await this.Video.Uploads.create(assetBodyParams);

        task.title = `${file}: uploading`;
        await this.uploadFile(
          path.resolve(process.cwd(), args.path, file),
          upload.url
        );

        task.title = `${file}: waiting for asset to be playable`;
        const { asset_id: assetId } = await this.pollUpload(upload.id);

        if (!assetId) {
          throw new Error(`Asset for upload '${upload.id}' failed to resolve.`);
        }
        const asset = await this.pollAsset(assetId);

        const playbackUrl = this.playbackUrl(asset);
        task.title = `${file}: ${playbackUrl}`;
        ctx.assets = [
          ...(ctx.assets || [['Filename', 'Asset ID', 'PlaybackURL']]),
          [file, asset.id, playbackUrl],
        ];
      },
    }));

    // I hate this `any` here, but I'm running into a weird issue casting
    // the `tasks` above to an array of `ListrTasks[]`.
    try {
      const finalCtx = await new Listr(tasks as any, {
        concurrent: flags.concurrent,
      }).run();

      const tsv = finalCtx.assets
        .map((row: string[]) => row.join('\t'))
        .join('\n');
      if (prompt.files.length > 1 && !process.env.WSL_DISTRO_NAME) {
        await clipboard.write(tsv);

        return this.log(
          chalk`
  📹 {bold.underline Assets ready for your enjoyment:}
  ${tsv}

  {blue (copied to your clipboard)}`
        );
      }

      await clipboard.write(finalCtx.assets[1][2]);
      return this.log(
        chalk`
  📹 {bold.underline Asset ready for your enjoyment:}
  ${tsv}

  {blue (since you only uploaded one asset, we just added the playback URL to your clipboard.)}`
      );
    } catch (err) {
      // TODO: make this clearer / separate it out per video for more obvious debugging.
      console.log("Error during video processing: ", err);
    }
  }
}
