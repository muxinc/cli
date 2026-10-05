import { Command } from '@cliffy/command';
import { executeVerify } from '@/lib/migrate/cli.ts';
import {
  createIO,
  createMuxContext,
  type SharedOptions,
  withContext,
} from './_shared.ts';

export const verifyCommand = new Command()
  .description(
    'Check every migrated asset against its source and find duplicate assets',
  )
  .option('--ids <ids:string>', 'Verify only these comma-separated source IDs')
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output JSON')
  .action(async (options: SharedOptions & { ids?: string }) => {
    const ctx = await withContext(createIO(options), () =>
      createMuxContext(options),
    );
    process.exit(await executeVerify(options, ctx));
  });
