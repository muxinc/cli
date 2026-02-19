#!/usr/bin/env bun
import { Command } from '@cliffy/command';
import { CompletionsCommand } from '@cliffy/command/completions';
import pkg from '../package.json';
import { assetsCommand } from './commands/assets/index.ts';
import { envCommand } from './commands/env/index.ts';
import { liveCommand } from './commands/live/index.ts';
import { loginCommand } from './commands/login.ts';
import { logoutCommand } from './commands/logout.ts';
import { playbackIdsCommand } from './commands/playback-ids/index.ts';
import { signCommand } from './commands/sign.ts';
import { signingKeysCommand } from './commands/signing-keys/index.ts';

const VERSION = pkg.version;

// Main CLI command
const cli = new Command()
  .name('mux')
  .version(VERSION)
  .description('Official Mux CLI for interacting with Mux APIs')
  .action(function () {
    this.showHelp();
  })
  .allowEmpty(true)
  .command('login', loginCommand)
  .command('logout', logoutCommand)
  .command('env', envCommand)
  .command('assets', assetsCommand)
  .command('live', liveCommand)
  .command('playback-ids', playbackIdsCommand)
  .command('signing-keys', signingKeysCommand)
  .command('sign', signCommand)
  .command('completions', new CompletionsCommand());

// Run the CLI
if (import.meta.main) {
  try {
    await cli.parse(Bun.argv.slice(2));
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unknown error occurred');
    }
    process.exit(1);
  }
}

export { cli };
