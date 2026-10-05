import { Command } from '@cliffy/command';
import { exportCommand } from './export.ts';
import { initCommand } from './init.ts';
import { planCommand } from './plan.ts';
import { retryCommand } from './retry.ts';
import { runCommand } from './run.ts';
import { statusCommand } from './status.ts';
import { verifyCommand } from './verify.ts';

export const migrateCommand = new Command()
  .description('Move a video library from another platform into Mux')
  .action(function () {
    this.showHelp();
  })
  .command('init', initCommand)
  .command('plan', planCommand)
  .command('run', runCommand)
  .command('status', statusCommand)
  .command('verify', verifyCommand)
  .command('export', exportCommand)
  .command('retry', retryCommand);
