import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MigrationState } from './state.ts';
import { summarizeStatus } from './status.ts';
import { sourceItem } from './testing/fakes.ts';

describe('summarizeStatus', () => {
  let tempDir: string;
  let state: MigrationState;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-status-'));
    state = MigrationState.open(join(tempDir, 'state.db'));
  });

  afterEach(async () => {
    state.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  function seed(ids: string[]) {
    state.initMigration('manifest');
    state.upsertDiscovered(ids.map((id) => sourceItem(id)));
  }

  test('reports a state file with no migration', () => {
    const report = summarizeStatus(state);

    expect(report.migration_id).toBeNull();
    expect(report.exit_code).toBe(2);
    expect(report.next_command).toContain('mux migrate plan');
  });

  test('exits 4 with the run command while work remains', () => {
    seed(['a', 'b']);
    state.update('a', { state: 'ready', assetId: 'asset_1' });
    state.update('b', { state: 'processing', assetId: 'asset_2' });

    const report = summarizeStatus(state);

    expect(report.counts).toMatchObject({ ready: 1, processing: 1 });
    expect(report.in_flight).toEqual([
      {
        source_id: 'b',
        state: 'processing',
        asset_id: 'asset_2',
        since: expect.any(String),
      },
    ]);
    expect(report.exit_code).toBe(4);
    expect(report.next_command).toBe('mux migrate run --yes');
  });

  test('exits 1 with the retry command when only errored items remain', () => {
    seed(['a', 'b']);
    state.update('a', { state: 'ready' });
    const error = { code: 'MUX_ASSET_ERRORED', message: 'Unsupported codec' };
    state.update('b', { state: 'errored', error });

    const report = summarizeStatus(state);

    expect(report.errored).toEqual([{ source_id: 'b', error }]);
    expect(report.exit_code).toBe(1);
    expect(report.next_command).toBe('mux migrate retry');
  });

  test('exits 0 and points to export when complete', () => {
    seed(['a']);
    state.update('a', { state: 'ready' });

    const report = summarizeStatus(state);

    expect(report.exit_code).toBe(0);
    expect(report.next_command).toBe('mux migrate export');
  });

  test('lists pending captions with the command that attaches each one', () => {
    seed(['a']);
    state.update('a', {
      state: 'ready',
      assetId: 'asset_1',
      pendingCaptions: [
        {
          language: 'en',
          path: '.mux-migrate/captions/a.en.srt',
          closedCaptions: false,
        },
      ],
    });

    const report = summarizeStatus(state);

    expect(report.pending_captions).toEqual([
      {
        source_id: 'a',
        asset_id: 'asset_1',
        language: 'en',
        path: '.mux-migrate/captions/a.en.srt',
        attach_command:
          'mux assets tracks create asset_1 --url <URL of a.en.srt> --type text --text-type subtitles --language-code en',
      },
    ]);
  });

  test('lists recorded duplicates with the command that deletes each one', () => {
    seed(['a']);
    state.update('a', { state: 'ready', assetId: 'asset_1' });
    state.recordDuplicate({
      sourceId: 'a',
      keptAssetId: 'asset_1',
      duplicateAssetId: 'asset_2',
    });

    const report = summarizeStatus(state);

    expect(report.duplicates).toEqual([
      {
        source_id: 'a',
        kept_asset_id: 'asset_1',
        duplicate_asset_id: 'asset_2',
        delete_command: 'mux assets delete asset_2',
      },
    ]);
    expect(report.exit_code).toBe(0);
  });

  test('lists at most ten in-flight items, oldest first', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `item-${i}`);
    seed(ids);
    for (const id of ids) state.update(id, { state: 'processing' });

    const report = summarizeStatus(state);

    expect(report.in_flight).toHaveLength(10);
    expect(report.in_flight[0].source_id).toBe('item-0');
  });
});
