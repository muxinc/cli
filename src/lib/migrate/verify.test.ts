import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Asset } from '@mux/ts/resources/video/assets';
import { MigrationState } from './state.ts';
import {
  FakeClock,
  FakeEventSource,
  FakeMux,
  sourceItem,
} from './testing/fakes.ts';
import { verifyMigration } from './verify.ts';

describe('verifyMigration', () => {
  let tempDir: string;
  let state: MigrationState;
  let mux: FakeMux;
  let clock: FakeClock;
  let playbackRequests: string[];
  let playbackStatus: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-verify-'));
    state = MigrationState.open(join(tempDir, 'state.db'));
    clock = new FakeClock();
    mux = new FakeMux(clock, new FakeEventSource());
    playbackRequests = [];
    playbackStatus = 200;
    state.initMigration('manifest');
  });

  afterEach(async () => {
    state.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const fetchPlayback = (async (url: string | URL | Request) => {
    playbackRequests.push(String(url));
    return new Response('#EXTM3U', { status: playbackStatus });
  }) as typeof fetch;

  /** Adds a migrated item whose asset exists and is ready. */
  function migrated(
    sourceId: string,
    options: {
      duration?: number;
      captions?: number;
      textTracks?: number;
      sourceDuration?: number;
    } = {},
  ): Asset {
    const asset = mux.injectAsset({ external_id: `manifest:${sourceId}` });
    mux.markReady(asset.id);
    Object.assign(asset, {
      duration: options.duration ?? 60,
      tracks: Array.from({ length: options.textTracks ?? 0 }, (_, i) => ({
        id: `track_${i}`,
        type: 'text',
        status: 'ready',
      })),
    });
    state.upsertDiscovered([
      sourceItem(sourceId, {
        durationSeconds: options.sourceDuration ?? 60,
        captionCount: options.captions ?? 0,
      }),
    ]);
    state.update(sourceId, {
      state: 'ready',
      assetId: asset.id,
      playbackIds: [{ id: `pb_${sourceId}`, policy: 'public' }],
    });
    return asset;
  }

  const run = (ids?: string[]) =>
    verifyMigration({ state, mux, clock, fetch: fetchPlayback }, { ids });

  test('passes items whose asset, duration, tracks, and playback all check out', async () => {
    migrated('a', { captions: 1, textTracks: 1 });

    const report = await run();

    expect(report).toMatchObject({
      checked: 1,
      passed: 1,
      failed: [],
      duplicates: [],
      exit_code: 0,
    });
    expect(playbackRequests).toEqual(['https://stream.mux.com/pb_a.m3u8']);
    expect(state.get('a')?.verification).toMatchObject({ passed: true });
  });

  test('fails a duration more than one second from the source', async () => {
    migrated('a', { duration: 58.5, sourceDuration: 60 });

    const report = await run();

    expect(report.exit_code).toBe(1);
    expect(report.failed[0].checks).toContainEqual(
      expect.objectContaining({ name: 'duration', ok: false }),
    );
  });

  test('fails when fewer text tracks than source captions arrived, excluding pending captions', async () => {
    migrated('a', { captions: 2, textTracks: 1 });
    migrated('b', { captions: 2, textTracks: 1 });
    state.update('b', {
      pendingCaptions: [
        { language: 'en', path: 'b.en.srt', closedCaptions: false },
      ],
    });

    const report = await run();

    expect(report.failed.map((f) => f.source_id)).toEqual(['a']);
  });

  test('fails when playback does not respond', async () => {
    migrated('a');
    playbackStatus = 404;

    const report = await run();

    expect(report.failed[0].checks).toContainEqual(
      expect.objectContaining({ name: 'playback', ok: false }),
    );
  });

  test('skips the playback check for signed playback IDs', async () => {
    migrated('a');
    state.update('a', { playbackIds: [{ id: 'pb_signed', policy: 'signed' }] });

    const report = await run();

    expect(playbackRequests).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('marks items whose asset no longer exists as errored, so retry re-creates them', async () => {
    const asset = migrated('a');
    mux.assets = mux.assets.filter((a) => a.id !== asset.id);

    const report = await run();

    expect(report.exit_code).toBe(1);
    expect(report.next_command).toBe('mux migrate retry');
    expect(state.get('a')).toMatchObject({
      state: 'errored',
      error: { code: 'VERIFY_ASSET_MISSING' },
    });
  });

  test('fails items whose directive run did not complete', async () => {
    migrated('a');
    state.update('a', {
      directiveRuns: [
        {
          directiveId: 'drv_1',
          runId: 'drvrun_1',
          assetId: 'x',
          status: 'partial',
        },
      ],
    });

    const report = await run();

    expect(report.failed[0].checks).toContainEqual(
      expect.objectContaining({ name: 'directive_runs', ok: false }),
    );
  });

  test('reports assets that share an item external ID but are not the recorded asset', async () => {
    const kept = migrated('a');
    const extra = mux.injectAsset({ external_id: 'manifest:a' });
    mux.injectAsset({ external_id: 'vimeo:a' });

    const report = await run();

    expect(report.duplicates).toEqual([
      { sourceId: 'a', keptAssetId: kept.id, duplicateAssetId: extra.id },
    ]);
    expect(report.exit_code).toBe(1);
  });

  test('--ids verifies only the listed items', async () => {
    migrated('a');
    migrated('b');

    const report = await run(['b']);

    expect(report.checked).toBe(1);
  });
});
