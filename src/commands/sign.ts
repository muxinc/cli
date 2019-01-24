import chalk from 'chalk';
import * as clipboard from 'clipboardy';

import MuxBase from '../base';

export default class Sign extends MuxBase {
  static description = 'Creates a new signed URL token for a playback ID';

  static args = [
    {
      name: 'playback-id',
      description: 'Playback ID to create a signed URL token for.',
      required: true,
    },
  ];

  async run() {
    const { args } = this.parse(Sign);
    const playbackId = args['playback-id'];

    const key = this.JWT.sign(playbackId);
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
