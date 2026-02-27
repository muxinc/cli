#!/usr/bin/env bun
import { Command } from '@cliffy/command';
import { CompletionsCommand } from '@cliffy/command/completions';
import pkg from '../package.json';
import { annotationsCommand } from './commands/annotations/index.ts';
import { assetsCommand } from './commands/assets/index.ts';
import { deliveryUsageCommand } from './commands/delivery-usage/index.ts';
import { dimensionsCommand } from './commands/dimensions/index.ts';
import { drmConfigurationsCommand } from './commands/drm-configurations/index.ts';
import { envCommand } from './commands/env/index.ts';
import { errorsCommand } from './commands/errors/index.ts';
import { exportsCommand } from './commands/exports/index.ts';
import { incidentsCommand } from './commands/incidents/index.ts';
import { liveCommand } from './commands/live/index.ts';
import { loginCommand } from './commands/login.ts';
import { logoutCommand } from './commands/logout.ts';
import { metricsCommand } from './commands/metrics/index.ts';
import { monitoringCommand } from './commands/monitoring/index.ts';
import { playbackIdsCommand } from './commands/playback-ids/index.ts';
import { playbackRestrictionsCommand } from './commands/playback-restrictions/index.ts';
import { signCommand } from './commands/sign.ts';
import { signingKeysCommand } from './commands/signing-keys/index.ts';
import { transcriptionVocabulariesCommand } from './commands/transcription-vocabularies/index.ts';
import { uploadsCommand } from './commands/uploads/index.ts';
import { videoViewsCommand } from './commands/video-views/index.ts';
import { setAgentMode } from './lib/context.ts';
import { checkForUpdate } from './lib/update-notifier.ts';

const VERSION = pkg.version;

/**
 * Preprocess argv to handle --agent flag before Cliffy parses it.
 * Strips --agent from args, enables agent mode, and injects --json.
 */
function preprocessArgs(argv: string[]): string[] {
  const agentIndex = argv.indexOf('--agent');
  if (agentIndex === -1) {
    return argv;
  }

  setAgentMode(true);
  const args = argv.filter((_, i) => i !== agentIndex);

  if (!args.includes('--json')) {
    args.push('--json');
  }

  return args;
}

// Main CLI command
const cli = new Command()
  .name('mux')
  .version(VERSION)
  .description('Official Mux CLI for interacting with Mux APIs')
  .globalOption(
    '--agent',
    'Agent mode: uses JSON output and identifies as an agent in User-Agent header.',
  )
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
  .command('playback-restrictions', playbackRestrictionsCommand)
  .command('signing-keys', signingKeysCommand)
  .command('sign', signCommand)
  .command('uploads', uploadsCommand)
  .command('transcription-vocabularies', transcriptionVocabulariesCommand)
  .command('delivery-usage', deliveryUsageCommand)
  .command('drm-configurations', drmConfigurationsCommand)
  .command('video-views', videoViewsCommand)
  .command('metrics', metricsCommand)
  .command('monitoring', monitoringCommand)
  .command('incidents', incidentsCommand)
  .command('annotations', annotationsCommand)
  .command('dimensions', dimensionsCommand)
  .command('errors', errorsCommand)
  .command('exports', exportsCommand)
  .command('completions', new CompletionsCommand());

// Run the CLI
if (import.meta.main) {
  const updateCheck = checkForUpdate(VERSION).catch(() => null);

  try {
    await cli.parse(preprocessArgs(Bun.argv.slice(2)));
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unknown error occurred');
    }
    process.exit(1);
  }

  const notice = await updateCheck;
  if (notice) console.error(notice);
}

export { cli };
