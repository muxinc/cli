import { Command } from '@cliffy/command';
import { executeRetry } from '@/lib/migrate/cli.ts';
import { createStateContext, type SharedOptions } from './_shared.ts';

export const retryCommand = new Command()
  .description('Re-queue errored items for the next run')
  .option(
    '--ids <ids:string>',
    'Re-queue only these comma-separated source IDs',
  )
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output JSON')
  .action((options: SharedOptions & { ids?: string }) => {
    process.exit(executeRetry(options, createStateContext(options)));
  });
