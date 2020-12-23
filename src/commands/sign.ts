import { flags } from '@oclif/command';
import * as chalk from 'chalk';
import * as clipboard from 'clipboardy';

import { CommandBase } from '../command-bases/base';
import { JWT } from '@mux/mux-node';

export default class Sign extends CommandBase {
  static description = 'Creates a new signed URL token for a playback ID';
  static aliases = ['private-playback:sign-asset'];

  static args = [
    {
      name: 'playback-id',
      description: 'Playback ID to create a signed URL token for.',
      required: true,
    },
  ];

  static flags = {
    ...CommandBase.flags,
    expiresIn: flags.string({
      char: 'e',
      description: 'How long the signature is valid for. If no unit is specified, milliseconds is assumed.',
      default: '7d',
    }),
    type: flags.string({
      char: 't',
      description: 'What type of token this signature is for.',
      default: 'video',
      options: ['video', 'thumbnail', 'gif', 'storyboard'],
    })
  };

  async run() {
    const { args, flags } = this.parse(Sign);
    const playbackId = args['playback-id'];

    const options = {
      expiration: flags.expiresIn,
      type: flags.type,
      keyId: this.MuxProfile?.signingKey?.keyId,
      keySecret: this.MuxProfile?.signingKey?.keySecret,
    };
    // I dislike the `as any` here but we're dealing with pre-filtered stuff here
    const key = JWT.sign(playbackId, options as any);
    const url = `https://stream.mux.com/${playbackId}.m3u8?token=${key}`;

    this.log(
      chalk`
🔑 {bold.underline Your Mux Signed Token}
{blue ${key}}

🌏 {bold.underline Full URL}
{green ${url}}
`
    );

    try {
      await clipboard.write(url);
      this.log(`👉 Copied Full URL to your system clipboard`);
    } catch {
      this.error('Unable to copy full url automatically');
    }
  }
}
