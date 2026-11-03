import { Command } from '@cliffy/command';
import { MigrationFailure } from '@/lib/migrate/errors.ts';
import { initMigration } from '@/lib/migrate/init.ts';
import { createIO, exitWithError } from './_shared.ts';

export const initCommand = new Command()
  .description('Write a starter recipe file (mux-migrate.json) for a provider')
  .arguments('<provider:string>')
  .option('--force', 'Replace an existing recipe file')
  .option('--json', 'Output JSON')
  .action(
    async (options: { force?: boolean; json?: boolean }, provider: string) => {
      const io = createIO(options);
      try {
        const result = await initMigration(provider, process.cwd(), options);
        if (io.json) {
          io.out(JSON.stringify(result, null, 2));
        } else {
          io.out(`Wrote ${result.recipe}. Review the source settings in it.`);
          if (result.credentials.length > 0) {
            io.out('Set these environment variables before planning:');
            for (const variable of result.credentials) {
              const optional = variable.required ? '' : ' (optional)';
              io.out(`  ${variable.name}${optional}: ${variable.description}`);
            }
          }
          io.out(`Next: ${result.next_command}`);
        }
      } catch (error) {
        if (error instanceof MigrationFailure)
          exitWithError(io, error.toJSON());
        throw error;
      }
    },
  );
