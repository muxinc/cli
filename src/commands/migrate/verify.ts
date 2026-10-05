import { Command } from '@cliffy/command';
import { executeVerify } from '@/lib/migrate/cli.ts';
import {
  createIO,
  createMigrateContext,
  type SourceOptions,
  withContext,
} from './_shared.ts';

export const verifyCommand = new Command()
  .description(
    'Check every migrated asset against its source and find duplicate assets',
  )
  .option('--ids <ids:string>', 'Verify only these comma-separated source IDs')
  .option(
    '--recipe <path:string>',
    'Recipe file (default: ./mux-migrate.json if present)',
  )
  .option('--manifest <path:string>', 'Manifest file for the manifest provider')
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output JSON')
  .action(async (options: SourceOptions & { ids?: string }) => {
    const ctx = await withContext(createIO(options), () =>
      createMigrateContext(undefined, options),
    );
    process.exit(await executeVerify(options, ctx));
  });
