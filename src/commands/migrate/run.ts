import { Command, EnumType } from '@cliffy/command';
import { executeRun, type RunFlags } from '@/lib/migrate/cli.ts';
import {
  createIO,
  createMigrateContext,
  type SourceOptions,
  withContext,
} from './_shared.ts';

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const runCommand: Command<any> = new Command()
  .description(
    'Create Mux assets for the source library. Resumable: run it again to continue.',
  )
  .type('policy', new EnumType(['public', 'signed', 'drm']))
  .type('quality', new EnumType(['basic', 'plus', 'premium']))
  .type('tier', new EnumType(['1080p', '1440p', '2160p']))
  .arguments('[provider:string]')
  .option(
    '--yes',
    'Confirm creating assets. Without it, the plan is printed and nothing is created.',
  )
  .option('--limit <n:integer>', 'Process at most n items, for a pilot run')
  .option('--ids <ids:string>', 'Process only these comma-separated source IDs')
  .option(
    '--time-budget <duration:string>',
    'Stop cleanly after this long, such as 8m',
  )
  .option('--concurrency <n:integer>', 'Parallel asset creations')
  .option(
    '--no-wait',
    'Exit once every asset is created, without waiting for ready',
  )
  .option('--playback-policy <policy:policy>', 'Playback policy. Repeatable.', {
    collect: true,
  })
  .option('--video-quality <quality:quality>', 'Video quality')
  .option('--max-resolution-tier <tier:tier>', 'Maximum resolution tier')
  .option(
    '--test',
    'Create test assets (watermarked, 10 seconds, deleted after 24 hours)',
  )
  .option(
    '--recipe <path:string>',
    'Recipe file (default: ./mux-migrate.json if present)',
  )
  .option('--manifest <path:string>', 'Manifest file for the manifest provider')
  .option(
    '--credential <assignment:string>',
    'Provider credential as NAME=value, overriding the environment variable. Repeatable.',
    { collect: true },
  )
  .option(
    '--state <path:string>',
    'State file (default: ./.mux-migrate/state.db)',
  )
  .option('--json', 'Output newline-delimited JSON events')
  .action(async (options: RunFlags & SourceOptions, provider?: string) => {
    const ctx = await withContext(createIO(options), () =>
      createMigrateContext(provider, options),
    );
    process.exit(await executeRun(options, ctx));
  });
