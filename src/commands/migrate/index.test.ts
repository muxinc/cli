import { describe, expect, test } from 'bun:test';
import { migrateCommand } from './index.ts';
import { runCommand } from './run.ts';

describe('mux migrate', () => {
  test('has the documented subcommands', () => {
    const names = migrateCommand.getCommands().map((c) => c.getName());
    expect(names.sort()).toEqual([
      'export',
      'init',
      'plan',
      'retry',
      'run',
      'status',
      'verify',
    ]);
  });

  test('run has the documented flags', () => {
    const flags = runCommand.getOptions().map((o) => o.name);
    for (const flag of [
      'yes',
      'limit',
      'ids',
      'time-budget',
      'concurrency',
      'no-wait',
      'directive',
      'skip-robots',
      'playback-policy',
      'video-quality',
      'max-resolution-tier',
      'test',
      'recipe',
      'manifest',
      'state',
      'json',
    ]) {
      expect(flags).toContain(flag);
    }
  });
});
