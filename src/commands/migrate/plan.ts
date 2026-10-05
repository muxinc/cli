import { Command } from '@cliffy/command';
import { executePlan } from '@/lib/migrate/cli.ts';
import {
  createIO,
  createMigrateContext,
  type SourceOptions,
  withContext,
} from './_shared.ts';

export const planCommand = new Command()
  .description(
    'Inventory the source library and record it in the state file. Free.',
  )
  .arguments('[provider:string]')
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
  .action(async (options: SourceOptions, provider?: string) => {
    const ctx = await withContext(createIO(options), () =>
      createMigrateContext(provider, options),
    );
    process.exit(await executePlan(ctx));
  });
