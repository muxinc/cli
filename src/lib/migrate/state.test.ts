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

describe('MigrationState queries', () => {
  let dir: string;
  let state: MigrationState;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-state-queries-'));
    state = MigrationState.open(join(dir, 'state.db'));
    state.initMigration('manifest');
    state.upsertDiscovered(['a', 'b', 'c', 'd'].map((id) => sourceItem(id)));
    state.update('a', { state: 'processing' });
    state.update('b', { state: 'processing' });
    state.update('c', {
      state: 'ready',
      pendingCaptions: [
        { language: 'en', path: 'c.en.srt', closedCaptions: false },
      ],
    });
  });

  afterEach(async () => {
    state.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('counts items in states, optionally limited to IDs', () => {
    expect(state.count(['processing', 'ready'])).toBe(3);
    expect(state.count(['processing'], ['a', 'c', 'missing'])).toBe(1);
    expect(state.counts(['c', 'd'])).toMatchObject({
      ready: 1,
      discovered: 1,
      processing: 0,
    });
  });

  test('lists source IDs in discovery order', () => {
    expect(state.sourceIds()).toEqual(['a', 'b', 'c', 'd']);
  });

  test('returns the oldest items in states, up to a limit', () => {
    expect(state.oldest(['processing'], 1).map((r) => r.sourceId)).toEqual([
      'a',
    ]);
  });

  test('lists items with pending captions', () => {
    expect(state.withPendingCaptions().map((r) => r.sourceId)).toEqual(['c']);
  });
});

describe('MigrationState duplicates and run lock', () => {
  let dir: string;
  let state: MigrationState;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-state-dupes-'));
    state = MigrationState.open(join(dir, 'state.db'));
    state.initMigration('manifest');
    state.upsertDiscovered([sourceItem('a')]);
  });

  afterEach(async () => {
    state.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('records each duplicate once', () => {
    const duplicate = {
      sourceId: 'a',
      keptAssetId: 'asset_1',
      duplicateAssetId: 'asset_2',
    };
    state.recordDuplicate(duplicate);
    state.recordDuplicate(duplicate);

    expect(state.duplicates()).toEqual([duplicate]);
  });

  test('holds the run lock for one run at a time', () => {
    const first = state.acquireRunLock();
    expect(first).toBeDefined();
    expect(state.acquireRunLock()).toBeUndefined();

    first?.release();
    expect(state.acquireRunLock()).toBeDefined();
  });

  test('takes over a lock left by a process that no longer exists', () => {
    state.acquireRunLock({ pid: 2 ** 22 + 12345 });

    expect(state.acquireRunLock()).toBeDefined();
  });
});
