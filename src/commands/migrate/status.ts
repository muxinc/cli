import { Command } from '@cliffy/command';
import { executeStatus } from '@/lib/migrate/cli.ts';
import { createStateContext, type SharedOptions } from './_shared.ts';

export const statusCommand = new Command()
  .description('Summarize migration progress from the state file')
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output JSON')
  .action((options: SharedOptions) => {
    process.exit(executeStatus(createStateContext(options)));
  });
