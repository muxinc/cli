import { Command, EnumType } from '@cliffy/command';
import { executeExport } from '@/lib/migrate/cli.ts';
import type { ItemState } from '@/lib/migrate/types.ts';
import { createStateContext, type SharedOptions } from './_shared.ts';

interface ExportOptions extends SharedOptions {
  format?: 'json' | 'csv';
  output?: string;
  include?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const exportCommand: Command<any> = new Command()
  .description(
    'Write the mapping from source videos to Mux assets and playback IDs',
  )
  .type('format', new EnumType(['json', 'csv']))
  .option('--format <format:format>', 'Output format', {
    default: 'json' as const,
  })
  .option('--output <path:string>', 'Write to a file instead of stdout')
  .option(
    '--include <states:string>',
    'Comma-separated item states to include',
    {
      default: 'ready',
    },
  )
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output JSON')
  .action((options: ExportOptions) => {
    const include = options.include
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) as ItemState[] | undefined;
    process.exit(
      executeExport({ ...options, include }, createStateContext(options)),
    );
  });
