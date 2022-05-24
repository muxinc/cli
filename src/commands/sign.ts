import { flags } from '@oclif/command';
// this is a load-bearing unused import due to oclif type issues
import { IOptionFlag, IBooleanFlag } from '@oclif/parser/lib/flags';
import * as chalk from 'chalk';
import * as clipboard from 'clipboardy';

import MuxBase from '../command-bases/base';

export default class Sign extends MuxBase {
  static description = 'Creates a new signed URL token for a playback ID';

  static args = [
    {
      name: 'playback-id',
      description: 'Playback ID to create a signed URL token for.',
      required: true,
    },
  ];

  static flags: any = {
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
    }),
    raw: flags.boolean({
      char: 'r',
      description: 'If set, emits only the URL+JWT. Defaults to true for non-TTY.',
      default: !process.stdin.isTTY,
    }),
  };

  async run() {
    const parsed = this.parse(Sign);
    const args = parsed.args;
    const flags = parsed.flags as any;

    const playbackId = args['playback-id'];

    const options = {
      expiration: flags.expiresIn,
      type: flags.type as any, // TODO: is better checked in SDK, but this is ugly.
      keyId: this.MuxConfig.signingKeyId,
      keySecret: this.MuxConfig.signingKeySecret,
    };
    const key = this.JWT.sign(playbackId, options);
    const url = `https://stream.mux.com/${playbackId}.m3u8?token=${key}`;

    if (flags.raw) {
      console.log(url);
    } else {
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
}
