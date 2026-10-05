import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMapping, mappingToCsv } from './export.ts';
import { MigrationState } from './state.ts';
import { sourceItem } from './testing/fakes.ts';

describe('mapping export', () => {
  let tempDir: string;
  let state: MigrationState;
  const now = new Date('2026-10-05T18:00:00Z');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-export-'));
    state = MigrationState.open(join(tempDir, 'state.db'));
    state.initMigration('manifest');
    state.upsertDiscovered([
      sourceItem('a', {
        title: 'Tour, part "one"',
        description: 'A walkthrough',
        tags: ['onboarding'],
        durationSeconds: 184.2,
        posterUrl: 'https://cdn.example.com/a.jpg',
        chapters: [{ title: 'Intro', startSeconds: 0 }],
      }),
      sourceItem('b'),
    ]);
    state.update('a', {
      state: 'ready',
      fidelity: 'original',
      assetId: 'asset_1',
      playbackIds: [{ id: 'pb_1', policy: 'public' }],
      directiveRuns: [
        {
          directiveId: 'drv_1',
          runId: 'drvrun_1',
          assetId: 'asset_1',
          status: 'completed',
        },
      ],
    });
    state.update('b', { state: 'errored', error: { code: 'X', message: 'x' } });
    state.update('a', {
      verification: { verifiedAt: 0, passed: true, checks: [] },
    });
  });

  afterEach(async () => {
    state.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('includes only the requested states', () => {
    const mapping = buildMapping(state, { include: ['ready'], now });

    expect(mapping).toMatchObject({
      version: 1,
      migration_id: expect.stringMatching(/^mig_/),
      provider: 'manifest',
      exported_at: '2026-10-05T18:00:00.000Z',
    });
    expect(mapping.items.map((i) => i.source_id)).toEqual(['a']);
  });

  test('maps each item to the documented fields', () => {
    const [item] = buildMapping(state, { include: ['ready'], now }).items;

    expect(item).toEqual({
      source_id: 'a',
      source_url: 'https://example.com/a.mp4',
      source_embed_patterns: ['example.com/a'],
      title: 'Tour, part "one"',
      description: 'A walkthrough',
      tags: ['onboarding'],
      folder: null,
      duration_seconds: 184.2,
      source_poster_url: 'https://cdn.example.com/a.jpg',
      source_chapters: [{ title: 'Intro', start_seconds: 0 }],
      fidelity: 'original',
      asset_id: 'asset_1',
      playback_ids: [{ id: 'pb_1', policy: 'public' }],
      directive_runs: [
        { directive_id: 'drv_1', run_id: 'drvrun_1', status: 'completed' },
      ],
      status: 'ready',
      verified: true,
    });
  });

  test('writes CSV with the scalar columns and escapes values', () => {
    const csv = mappingToCsv(
      buildMapping(state, { include: ['ready', 'errored'], now }),
    );

    expect(csv.trimEnd().split('\n')).toEqual([
      'source_id,source_url,title,fidelity,asset_id,playback_id,status,verified',
      'a,https://example.com/a.mp4,"Tour, part ""one""",original,asset_1,pb_1,ready,true',
      'b,https://example.com/b.mp4,,,,,errored,',
    ]);
  });
});
