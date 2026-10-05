import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalCaptionStore } from './captions.ts';
import { runMigration } from './engine.ts';
import { buildMapping } from './export.ts';
import { createWistiaProvider } from './providers/wistia.ts';
import { MigrationState } from './state.ts';
import { summarizeStatus } from './status.ts';
import { FakeClock, FakeEventSource, FakeMux } from './testing/fakes.ts';
import { noSleep, routeFetch } from './testing/route-fetch.ts';

const srt = '1\n00:00:00,000 --> 00:00:01,000\nHello\n';

function media(id: string, status = 'ready') {
  return {
    id: 1,
    hashed_id: id,
    name: `Video ${id}`,
    type: 'Video',
    duration: 184.2,
    created: '2024-01-02T03:04:05+00:00',
    status,
    assets: [
      {
        url: `https://embed-ssl.wistia.com/deliveries/${id}-original.bin`,
        width: 1920,
        height: 1080,
        file_size: 5000,
        content_type: 'video/mp4',
        type: 'OriginalFile',
      },
    ],
  };
}

describe('migrating a Wistia library end to end', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-integration-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('creates one asset per ready video, saves inline captions, and exports the mapping', async () => {
    const { fetch } = routeFetch({
      'GET /modern/medias': (url) =>
        url.searchParams.get('per_page') === '1'
          ? [media('abc')]
          : [media('abc'), media('def'), media('wip', 'processing')],
      'GET /modern/medias/abc': () => media('abc'),
      'GET /modern/medias/def': () => media('def'),
      'GET /modern/medias/abc/captions': () => [
        { language: 'eng', english_name: 'English', text: srt },
      ],
      'GET /modern/medias/def/captions': () => [],
    });
    const provider = createWistiaProvider({ fetch, sleep: noSleep });
    const clock = new FakeClock();
    const stream = new FakeEventSource();
    const mux = new FakeMux(clock, stream);
    const state = MigrationState.open(join(dir, '.mux-migrate', 'state.db'));

    const result = await runMigration(
      {
        state,
        provider,
        credentials: { apiToken: 'wistia-token' },
        mux,
        events: stream,
        clock,
        captions: createLocalCaptionStore(join(dir, '.mux-migrate')),
      },
      { confirmed: true, concurrency: 1 },
    );

    expect(result).toMatchObject({
      exitCode: 0,
      ready: 2,
      skipped: 1,
      remaining: 0,
    });
    expect(mux.createCalls.map((c) => c.meta?.external_id).sort()).toEqual([
      'wistia:abc',
      'wistia:def',
    ]);
    expect(mux.createCalls[0].inputs?.[0]?.url).toContain('abc-original');

    const [caption] = summarizeStatus(state).pending_captions;
    expect(caption).toMatchObject({ source_id: 'abc', language: 'en' });
    expect(await readFile(caption.path, 'utf-8')).toBe(srt);
    expect(caption.attach_command).toContain('mux assets tracks create');

    const mapping = buildMapping(state, {
      include: ['ready'],
      now: new Date(0),
    });
    expect(mapping.items.map((i) => [i.source_id, i.fidelity])).toEqual([
      ['abc', 'original'],
      ['def', 'original'],
    ]);
    state.close();
  });
});
