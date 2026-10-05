import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestError, PermissionDeniedError } from '@mux/ts';
import {
  type MigrationDeps,
  type RunOptions,
  retryErrored,
  runMigration,
} from './engine.ts';
import { ProviderHttpError } from './http.ts';
import { MigrationState } from './state.ts';
import {
  FakeClock,
  FakeEventSource,
  FakeMux,
  FakeProvider,
  sourceItem,
} from './testing/fakes.ts';
import type { RunEvent, SourceItem, TextCaption } from './types.ts';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-regressions-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const fast: RunOptions['timing'] = {
  reconcileIntervalMs: 5,
  directiveStartTimeoutMs: 0,
  preparationTimeoutMs: 30,
  captionCleanupPollMs: 5,
  captionCleanupTimeoutMs: 1000,
};

function harness(items: SourceItem[]) {
  const clock = new FakeClock();
  const stream = new FakeEventSource();
  const mux = new FakeMux(clock, stream);
  const provider = new FakeProvider(items);
  const state = MigrationState.open(join(tempDir, 'state.db'));
  const emitted: RunEvent[] = [];
  const deps: MigrationDeps = {
    state,
    provider,
    credentials: undefined,
    mux,
    events: stream,
    clock,
    emit: (event) => emitted.push(event),
  };
  const run = (options: Partial<RunOptions> = {}) =>
    runMigration(deps, {
      confirmed: true,
      concurrency: 1,
      timing: fast,
      ...options,
    });
  const warnings = (code: string) =>
    emitted.filter((e) => e.type === 'warning' && e.code === code);
  return { clock, stream, mux, provider, state, emitted, deps, run, warnings };
}

const srt = (language: string): TextCaption => ({
  kind: 'text',
  text: `1\n00:00:00,000 --> 00:00:01,000\n${language}\n`,
  format: 'srt',
  language,
  closedCaptions: false,
});

function inlineCaptions(h: ReturnType<typeof harness>, languages: string[]) {
  h.provider.resolveOverride = (item) => ({
    kind: 'resolved',
    url: `https://cdn.example.com/${item.sourceId}.mp4`,
    fidelity: 'original',
    captions: languages.map(srt),
  });
}

describe('retry after an asset errors', () => {
  test('creates a replacement asset that completes, without reporting a duplicate', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.autoReady = false;
    h.mux.afterCreate = (asset) =>
      queueMicrotask(() =>
        h.stream.deliver({
          id: 'evt_err',
          type: 'video.asset.errored',
          data: { ...asset, status: 'errored' },
        }),
      );
    await h.run();
    expect(h.state.get('a')?.state).toBe('errored');

    retryErrored(h.state);
    h.mux.afterCreate = undefined;
    h.mux.autoReady = true;
    const result = await h.run();

    expect(result.exitCode).toBe(0);
    expect(h.state.get('a')).toMatchObject({
      state: 'ready',
      assetId: h.mux.assets[0].id,
    });
    expect(result.duplicates).toEqual([]);
    expect(h.warnings('DUPLICATE_ASSET')).toEqual([]);
  });
});

describe('source errors', () => {
  test('an item whose source cannot be resolved is errored without stopping the run', async () => {
    const h = harness([sourceItem('a'), sourceItem('b'), sourceItem('c')]);
    h.provider.resolveOverride = (item) => {
      if (item.sourceId === 'b') {
        throw new ProviderHttpError(
          'VIMEO_NOT_FOUND',
          'GET /videos/b failed with HTTP 404.',
          404,
        );
      }
      return {
        kind: 'resolved',
        url: 'https://x/y.mp4',
        fidelity: 'original',
        captions: [],
      };
    };

    const result = await h.run();

    expect(h.state.get('b')).toMatchObject({
      state: 'errored',
      error: { code: 'VIMEO_NOT_FOUND' },
    });
    expect(h.state.get('c')?.state).toBe('ready');
    expect(result.exitCode).toBe(1);
    expect(result.nextCommand).toBe('mux migrate retry');
  });

  test('a provider authentication failure stops the run instead of erroring every item', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.provider.resolveOverride = () => {
      throw new ProviderHttpError('VIMEO_UNAUTHORIZED', 'Token rejected.', 401);
    };

    await expect(h.run()).rejects.toMatchObject({ code: 'VIMEO_UNAUTHORIZED' });
    expect(h.state.get('b')?.state).toBe('discovered');
  });

  test('a Mux authentication failure on create stops the run with MUX_UNAUTHORIZED', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.mux.failCreate({
      match: () => true,
      error: new PermissionDeniedError(
        403,
        undefined,
        undefined,
        new Headers(),
      ),
      assetCreated: false,
    });

    await expect(h.run()).rejects.toMatchObject({ code: 'MUX_UNAUTHORIZED' });
    expect(h.mux.createCalls).toHaveLength(1);
  });

  test('a caption that cannot be saved errors only its item', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    inlineCaptions(h, ['en']);
    h.deps.captions = {
      saveLocal: async (sourceId) => {
        if (sourceId === 'a') throw new Error('EACCES: permission denied');
        return `/state/captions/${sourceId}.en.srt`;
      },
    };

    const result = await h.run();

    expect(h.state.get('a')).toMatchObject({
      state: 'errored',
      error: { code: 'CAPTIONS_SAVE_FAILED' },
    });
    expect(h.state.get('b')?.state).toBe('ready');
    expect(result.exitCode).toBe(1);
  });

  test('a passthrough over 255 characters errors the item before creating an asset', async () => {
    const h = harness([sourceItem('a', { passthrough: 'x'.repeat(256) })]);

    await h.run();

    expect(h.state.get('a')?.error?.code).toBe('PASSTHROUGH_TOO_LONG');
    expect(h.mux.createCalls).toHaveLength(0);
  });

  test('a rejected create is still errored per item', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.mux.failCreate({
      match: (p) => p.meta?.external_id === 'manifest:a',
      error: new BadRequestError(400, undefined, undefined, new Headers()),
      assetCreated: false,
    });

    await h.run();

    expect(h.state.get('a')?.state).toBe('errored');
    expect(h.state.get('b')?.state).toBe('ready');
  });
});

describe('long source IDs', () => {
  const longId = `videos/${'nested-folder/'.repeat(12)}final-cut.mp4`;

  test('keeps external IDs within 128 characters and still resumes without duplicates', async () => {
    const h = harness([sourceItem(longId), sourceItem('short')]);
    h.mux.failCreate({
      match: (p) => p.meta?.external_id !== 'manifest:short',
      error: new (await import('@mux/ts')).APIConnectionTimeoutError(),
      assetCreated: true,
    });

    const result = await h.run();

    const externalId = h.mux.createCalls[0].meta?.external_id as string;
    expect(longId.length + 'manifest:'.length).toBeGreaterThan(128);
    expect([...externalId].length).toBeLessThanOrEqual(128);
    expect(externalId).toStartWith('manifest:');
    expect(h.state.get(longId)?.state).toBe('ready');
    expect(result.exitCode).toBe(0);

    await h.run();
    expect(h.mux.createCalls).toHaveLength(2);
  });
});

describe('pending captions', () => {
  test('reports an attach command for every saved caption', async () => {
    const h = harness([sourceItem('a')]);
    inlineCaptions(h, ['en', 'es']);
    h.deps.captions = {
      saveLocal: async (sourceId, caption) =>
        `/state/captions/${sourceId}.${caption.language}.srt`,
    };

    await h.run();

    const commands = h
      .warnings('CAPTIONS_PENDING')
      .map((w) => (w.type === 'warning' ? w.next_command : undefined));
    expect(commands).toEqual([
      expect.stringContaining('--language-code en'),
      expect.stringContaining('--language-code es'),
    ]);
  });
});

describe('hosted caption cleanup', () => {
  function withHost(h: ReturnType<typeof harness>) {
    const uploads: string[] = [];
    const removed: string[] = [];
    h.deps.captions = {
      saveLocal: async () => '/unused',
      host: {
        upload: async (key) => {
          uploads.push(key);
          return `https://bucket.example.com/${key}`;
        },
        remove: async (key) => {
          removed.push(key);
        },
      },
    };
    return { uploads, removed };
  }

  test('waits for text tracks that are still preparing, then removes the uploads', async () => {
    const h = harness([sourceItem('a')]);
    inlineCaptions(h, ['en']);
    const host = withHost(h);
    h.mux.textTrackStatus = 'preparing';
    h.mux.afterCreate = (asset) =>
      setTimeout(() => {
        for (const track of h.mux.assets.find((a) => a.id === asset.id)
          ?.tracks ?? []) {
          track.status = 'ready';
        }
      }, 20);

    await h.run();

    expect(host.removed).toEqual(host.uploads);
    expect(h.state.get('a')?.hostedCaptions).toEqual([]);
  });

  test('removes uploads for items whose create is rejected', async () => {
    const h = harness([sourceItem('a')]);
    inlineCaptions(h, ['en']);
    const host = withHost(h);
    h.mux.failCreate({
      match: () => true,
      error: new BadRequestError(400, undefined, undefined, new Headers()),
      assetCreated: false,
    });

    await h.run();

    expect(host.uploads).toHaveLength(1);
    expect(host.removed).toEqual(host.uploads);
  });
});

describe('runs that could wait forever', () => {
  test('a directive that never starts a run is reported and does not hold the run open', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.directives.set('drv_1', {
      id: 'drv_1',
      name: 'Chapters',
      workflows: [],
    });
    h.mux.startDirectiveRuns = false;

    const result = await h.run({ directives: ['drv_1'] });

    expect(h.state.get('a')?.state).toBe('ready');
    expect(h.warnings('DIRECTIVE_RUN_NOT_STARTED')).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  test('a source that stays pending stops being retried and exits 4', async () => {
    const h = harness([sourceItem('a')]);
    h.provider.resolveOverride = () => ({ kind: 'pending', retryAfterMs: 5 });

    const result = await h.run();

    expect(h.state.get('a')?.state).toBe('preparing');
    expect(result.exitCode).toBe(4);
  });

  test('with --ids, items outside the selection do not hold the run open', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.state.initMigration('manifest');
    h.state.upsertDiscovered(h.provider.items);
    const stuck = h.mux.injectAsset({ external_id: 'manifest:b' });
    h.state.update('b', { state: 'processing', assetId: stuck.id });

    const result = await h.run({ ids: ['a'] });

    expect(result.exitCode).toBe(0);
    expect(h.state.get('a')?.state).toBe('ready');
  });

  test('a transient failure during a background reconcile does not stop the run', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.autoReady = false;
    let failures = 1;
    const retrieve = h.mux.retrieveAsset.bind(h.mux);
    h.mux.retrieveAsset = async (id) => {
      if (failures-- > 0) throw new Error('socket hang up');
      return retrieve(id);
    };
    h.mux.afterCreate = (asset) =>
      setTimeout(() => h.mux.markReady(asset.id), 30);

    const result = await h.run();

    expect(result.exitCode).toBe(0);
    expect(h.warnings('RECONCILE_FAILED').length).toBeGreaterThan(0);
  });
});

describe('scale', () => {
  test('rows read from the state file grow linearly with the library size', async () => {
    const rowsReadFor = async (n: number) => {
      const h = harness(
        Array.from({ length: n }, (_, i) => sourceItem(`v${i}`)),
      );
      const list = h.state.list.bind(h.state);
      let rows = 0;
      h.state.list = (filter) => {
        const result = list(filter);
        rows += result.length;
        return result;
      };
      h.mux.autoReady = false;
      h.mux.afterCreate = (asset) =>
        setTimeout(() => h.mux.markReady(asset.id), 1);
      const result = await h.run({ concurrency: 8 });
      expect(result.exitCode).toBe(0);
      h.state.close();
      for (const suffix of ['', '-wal', '-shm']) {
        await rm(join(tempDir, `state.db${suffix}`), { force: true });
      }
      return rows;
    };

    const small = await rowsReadFor(200);
    const large = await rowsReadFor(800);

    // Quadrupling the library may at most quadruple the reads (with slack),
    // not multiply them by sixteen.
    expect(large).toBeLessThan(small * 6);
  });
});
