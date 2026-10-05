import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MigrationState } from './state.ts';
import { sourceItem } from './testing/fakes.ts';

describe('MigrationState', () => {
  let tempDir: string;
  let path: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-state-'));
    path = join(tempDir, '.mux-migrate', 'state.db');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('creates the state directory and one migration per state file', () => {
    const state = MigrationState.open(path);
    const first = state.initMigration('manifest');
    const second = state.initMigration('manifest');
    state.close();

    expect(second.id).toBe(first.id);
    expect(first.id).toMatch(/^mig_/);
  });

  test('persists items and updates across reopen', () => {
    const state = MigrationState.open(path);
    state.initMigration('manifest');
    state.upsertDiscovered([sourceItem('a', { title: 'Product tour' })]);
    state.update('a', { state: 'creating', createStartedAt: 1_000 });
    state.close();

    const reopened = MigrationState.open(path);
    expect(reopened.get('a')).toMatchObject({
      sourceId: 'a',
      state: 'creating',
      createStartedAt: 1_000,
      item: { title: 'Product tour' },
      attempts: 0,
      playbackIds: [],
      directiveRuns: [],
    });
    reopened.close();
  });

  test('upserting existing items keeps their state', () => {
    const state = MigrationState.open(path);
    state.initMigration('manifest');
    state.upsertDiscovered([sourceItem('a')]);
    state.update('a', { state: 'ready', assetId: 'asset_1' });

    const { added } = state.upsertDiscovered([
      sourceItem('a'),
      sourceItem('b'),
    ]);

    expect(added).toBe(1);
    expect(state.get('a')).toMatchObject({
      state: 'ready',
      assetId: 'asset_1',
    });
    expect(state.get('b')?.state).toBe('discovered');
    state.close();
  });

  test('lists and counts items by state', () => {
    const state = MigrationState.open(path);
    state.initMigration('manifest');
    state.upsertDiscovered([sourceItem('a'), sourceItem('b'), sourceItem('c')]);
    state.update('a', { state: 'ready' });
    state.update('b', { state: 'errored', error: { code: 'X', message: 'x' } });

    expect(
      state
        .list({ states: ['ready', 'errored'] })
        .map((i) => i.sourceId)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(state.counts()).toMatchObject({
      ready: 1,
      errored: 1,
      discovered: 1,
      creating: 0,
    });
    state.close();
  });

  test('updating an unknown item throws', () => {
    const state = MigrationState.open(path);
    state.initMigration('manifest');

    expect(() => state.update('missing', { state: 'ready' })).toThrow();
    state.close();
  });
});
