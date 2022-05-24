import { flags } from '@oclif/command';
// this is a load-bearing unused import due to oclif type issues
import { IOptionFlag, IBooleanFlag } from '@oclif/parser/lib/flags';
import * as JWT from 'jsonwebtoken';
import * as chalk from 'chalk';
import * as clipboard from 'clipboardy';

import MuxBase from '../../command-bases/base';

export default class SignSpace extends MuxBase {
  static description = 'Creates a new signed token for a Mux Space';

  static args = [
    {
      name: 'space-id',
      description: 'Space ID for which a token shall be generated.',
      required: true,
    },
  ];

  static flags: any = {
    raw: flags.boolean({
      char: 'r',
      description: "prints a raw JWT to stdout (default if not tty)",
      default: !process.stdin.isTTY,
    }),
    participantId: flags.string({
      char: 'p',
      description: 'Optional, user-specified participant ID.',
    }),
    role: flags.string({
      char: 'R',
      description: 'One of \'publisher\' or \'subscriber\'.',
      default: 'publisher',
    }),
    expiresIn: flags.string({
      char: 'e',
      description: 'How long the signature is valid for. If no unit is specified, milliseconds is assumed.',
      default: '7d',
    }),
  };

  async run() {
    const parsed = this.parse(SignSpace);
    const args = parsed.args;
    const flags = parsed.flags as any;

    const signingKeySecret = this.MuxConfig.signingKeySecret;
    if (!signingKeySecret) {
      throw new Error("No signing key found. Re-run `mux init` and generate one!");
    }

    // TODO: replace with mux-node-sdk signing when available
    const payload = {
      role: flags.role,
      participant_id: flags.participantId,
      kid: this.MuxConfig.signingKeyId,
    };

    const jwtOptions: JWT.SignOptions = {
      audience: 'rt',
      subject: args['space-id'],
      algorithm: 'RS256',
      noTimestamp: true,
      expiresIn: flags.expiresIn,
    };

    const key = Buffer.from(signingKeySecret, 'base64');
    const jwt = JWT.sign(payload, key, jwtOptions);

    if (flags.raw) {
      console.log(jwt);
    } else {

      this.log(
        chalk`
🔑 Your JWT for Mux Spaces
{cyan ${jwt}}
        `
      )

      try {
        await clipboard.write(jwt);
        this.log(`👉 Copied your JWT to your system clipboard`);
      } catch {
        this.error('Unable to copy JWT automatically');
      }
    }
  }
}
