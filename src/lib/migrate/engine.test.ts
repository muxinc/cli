import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APIConnectionTimeoutError,
  BadRequestError,
  InternalServerError,
} from '@mux/ts';
import {
  type MigrationDeps,
  planMigration,
  type RunOptions,
  retryErrored,
  runMigration,
} from './engine.ts';
import { MigrationState } from './state.ts';
import {
  FakeClock,
  FakeEventSource,
  FakeMux,
  FakeProvider,
  SimulatedCrash,
  snapshotState,
  sourceItem,
} from './testing/fakes.ts';
import type { RunEvent, SourceItem } from './types.ts';

const MINUTE = 60_000;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function harness(items: SourceItem[], statePath = join(tempDir, 'state.db')) {
  const clock = new FakeClock();
  const stream = new FakeEventSource();
  const mux = new FakeMux(clock, stream);
  const provider = new FakeProvider(items);
  const state = MigrationState.open(statePath);
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
    runMigration(deps, { confirmed: true, concurrency: 1, ...options });
  return { clock, stream, mux, provider, state, emitted, deps, run, statePath };
}

function statesFor(emitted: RunEvent[], sourceId: string): string[] {
  return emitted.flatMap((e) =>
    e.type === 'item' && e.source_id === sourceId ? [e.state] : [],
  );
}

/** Seeds an item that a previous run left in `creating`. */
function seedCreating(h: ReturnType<typeof harness>, startedAt: number) {
  h.state.initMigration('manifest');
  h.state.upsertDiscovered(h.provider.items);
  h.state.update('a', { state: 'creating', createStartedAt: startedAt });
}

describe('confirmation', () => {
  test('without --yes, inventories the source, creates nothing, and exits 3', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);

    const result = await h.run({ confirmed: false });

    expect(result.exitCode).toBe(3);
    expect(h.mux.createCalls).toHaveLength(0);
    expect(result.plan?.total).toBe(2);
    expect(h.state.get('a')?.state).toBe('discovered');
  });
});

describe('plan', () => {
  test('discovers every page and is idempotent', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => sourceItem(id));
    const h = harness(items);

    expect((await planMigration(h.deps)).added).toBe(5);
    expect((await planMigration(h.deps)).added).toBe(0);

    h.provider.items.push(sourceItem('f'));
    const third = await planMigration(h.deps);
    expect(third.added).toBe(1);
    expect(third.total).toBe(6);
  });

  test('records non-exportable items as skipped', async () => {
    const h = harness([
      sourceItem('a'),
      sourceItem('b', { exportable: false, skipReason: 'Live archive' }),
    ]);

    const plan = await planMigration(h.deps);

    expect(plan.skipped).toBe(1);
    expect(h.state.get('b')?.state).toBe('skipped');
  });

  test('does not reset items that already progressed', async () => {
    const h = harness([sourceItem('a')]);
    await h.run();

    await planMigration(h.deps);

    expect(h.state.get('a')?.state).toBe('ready');
  });
});

describe('run', () => {
  test('migrates every item to ready and exits 0', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);

    const result = await h.run();

    expect(result.exitCode).toBe(0);
    expect(result.ready).toBe(2);
    expect(h.state.get('a')).toMatchObject({
      state: 'ready',
      assetId: expect.any(String),
      playbackIds: [{ id: expect.any(String), policy: 'public' }],
    });
  });

  test('builds the asset from the source item and run settings', async () => {
    const h = harness([
      sourceItem('a', { title: 'Product tour', passthrough: 'customer-1' }),
      sourceItem('b'),
    ]);
    h.provider.resolveOverride = (item) => ({
      kind: 'resolved',
      url: `https://cdn.example.com/${item.sourceId}.mp4`,
      fidelity: 'original',
      captions:
        item.sourceId === 'a'
          ? [
              {
                kind: 'url',
                url: 'https://cdn.example.com/a.en.vtt',
                language: 'en',
                label: 'English',
                closedCaptions: false,
              },
            ]
          : [],
    });

    await h.run({ asset: { playback_policies: ['signed'] } });

    const [a, b] = h.mux.createCalls;
    expect(a.inputs?.[0]).toMatchObject({
      url: 'https://cdn.example.com/a.mp4',
    });
    expect(a.inputs?.[1]).toMatchObject({
      url: 'https://cdn.example.com/a.en.vtt',
      type: 'text',
      text_type: 'subtitles',
      language_code: 'en',
      name: 'English',
      closed_captions: false,
    });
    expect(a.meta).toEqual({
      external_id: 'manifest:a',
      title: 'Product tour',
    });
    expect(a.passthrough).toBe('customer-1');
    expect(a.playback_policies).toEqual(['signed']);
    expect(b.passthrough).toBeUndefined();
  });

  test('resolves each URL immediately before creating its asset', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    const order: string[] = [];
    h.provider.resolveOverride = (item) => {
      order.push(`resolve:${item.sourceId}`);
      return {
        kind: 'resolved',
        url: 'https://x/y.mp4',
        fidelity: 'original',
        captions: [],
      };
    };
    h.mux.beforeCreate = (params) =>
      order.push(`create:${params.meta?.external_id}`);

    await h.run();

    expect(order).toEqual([
      'resolve:a',
      'create:manifest:a',
      'resolve:b',
      'create:manifest:b',
    ]);
  });

  test('never touches ready items again', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    await h.run();

    const second = await h.run();

    expect(h.mux.createCalls).toHaveLength(2);
    expect(second.exitCode).toBe(0);
  });

  test('records the recipe hash on each item it creates', async () => {
    const h = harness([sourceItem('a')]);

    await h.run({ recipeHash: 'hash-1' });

    expect(h.state.get('a')?.recipeHash).toBe('hash-1');
  });

  test('--limit processes at most n items and exits 4 with the command to continue', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => sourceItem(id));
    const h = harness(items);

    const result = await h.run({ limit: 2 });

    expect(h.mux.createCalls).toHaveLength(2);
    expect(result.exitCode).toBe(4);
    expect(result.remaining).toBe(3);
    expect(result.nextCommand).toBe('mux migrate run --yes --limit 2');
  });

  test('--ids processes only the listed items', async () => {
    const h = harness([sourceItem('a'), sourceItem('b'), sourceItem('c')]);

    await h.run({ ids: ['b'] });

    expect(h.mux.createCalls.map((c) => c.meta?.external_id)).toEqual([
      'manifest:b',
    ]);
  });

  test('--ids exits 0 once the listed items are done, even with other work left', async () => {
    const h = harness([sourceItem('a'), sourceItem('b'), sourceItem('c')]);

    const result = await h.run({ ids: ['b'] });

    expect(result.exitCode).toBe(0);
    expect(result.nextCommand).toBeUndefined();
  });

  test('--time-budget stops starting new items once the budget is spent', async () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => sourceItem(id));
    const h = harness(items);
    h.mux.createDurationMs = 4 * MINUTE;

    const result = await h.run({ timeBudgetMs: 10 * MINUTE });

    expect(result.exitCode).toBe(4);
    expect(h.mux.createCalls.length).toBeLessThan(4);
    expect(result.nextCommand).toBe('mux migrate run --yes --time-budget 10m');

    h.mux.createDurationMs = 0;
    const resumed = await h.run();
    expect(resumed.exitCode).toBe(0);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(h.mux.assetsWithExternalId(`manifest:${id}`)).toHaveLength(1);
    }
  });

  test('--no-wait exits once every asset is created', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.autoReady = false;

    const result = await h.run({ wait: false });

    expect(h.state.get('a')?.state).toBe('processing');
    expect(result.exitCode).toBe(4);
    // Re-running next_command must wait, or an agent would loop on exit 4.
    expect(result.nextCommand).toBe('mux migrate run --yes');
  });
});

describe('errors and retry', () => {
  test('a rejected create marks the item errored and exits 1 with the retry command', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.mux.failCreate({
      match: (p) => p.meta?.external_id === 'manifest:b',
      error: new BadRequestError(
        400,
        { error: { messages: ['Invalid input URL'] } },
        undefined,
        new Headers(),
      ),
      assetCreated: false,
    });

    const result = await h.run();

    expect(result.exitCode).toBe(1);
    expect(h.state.get('b')).toMatchObject({
      state: 'errored',
      error: { code: expect.any(String), message: expect.any(String) },
    });
    expect(result.nextCommand).toContain('mux migrate retry');
    expect(h.state.get('a')?.state).toBe('ready');
  });

  test('an asset that errors during processing marks the item errored', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.autoReady = false;
    h.mux.afterCreate = (asset) =>
      queueMicrotask(() =>
        h.stream.deliver({
          id: 'evt_err',
          type: 'video.asset.errored',
          data: {
            ...asset,
            status: 'errored',
            errors: { messages: ['Unsupported codec'] },
          },
        }),
      );

    const result = await h.run();

    expect(h.state.get('a')?.state).toBe('errored');
    expect(h.state.get('a')?.error?.message).toContain('Unsupported codec');
    expect(result.exitCode).toBe(1);
  });

  test('retry re-queues errored items so the next run completes them', async () => {
    const h = harness([sourceItem('a'), sourceItem('b')]);
    h.mux.failCreate({
      match: (p) => p.meta?.external_id === 'manifest:b',
      error: new BadRequestError(400, undefined, undefined, new Headers()),
      assetCreated: false,
    });
    await h.run();

    expect(retryErrored(h.state)).toBe(1);
    const result = await h.run();

    expect(result.exitCode).toBe(0);
    expect(h.state.get('b')?.state).toBe('ready');
  });

  test('provider items that cannot be resolved are errored with the provider code', async () => {
    const h = harness([sourceItem('a')]);
    h.provider.resolveOverride = () => ({
      kind: 'unavailable',
      code: 'BUNNY_NO_ORIGINAL_OR_MP4',
      message: 'No original or MP4 fallback is available.',
    });

    await h.run();

    expect(h.state.get('a')?.error?.code).toBe('BUNNY_NO_ORIGINAL_OR_MP4');
    expect(h.mux.createCalls).toHaveLength(0);
  });
});

describe('duplicate prevention', () => {
  test.each([
    ['timeout', () => new APIConnectionTimeoutError()],
    [
      '5xx',
      () => new InternalServerError(503, undefined, undefined, new Headers()),
    ],
  ])('a create that fails with a %s after Mux created the asset is adopted from its created event, not retried', async (_name, makeError) => {
    const h = harness([sourceItem('a')]);
    h.mux.failCreate({
      match: () => true,
      error: makeError(),
      assetCreated: true,
    });

    const result = await h.run();

    expect(h.mux.createCalls).toHaveLength(1);
    expect(h.mux.assetsWithExternalId('manifest:a')).toHaveLength(1);
    expect(h.state.get('a')).toMatchObject({
      state: 'ready',
      assetId: h.mux.assets[0].id,
    });
    expect(result.exitCode).toBe(0);
  });

  test('a create that times out with no asset created is left for the next run, which creates it once', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.failCreate({
      match: () => true,
      error: new APIConnectionTimeoutError(),
      assetCreated: false,
    });

    const first = await h.run();

    expect(h.mux.createCalls).toHaveLength(1);
    expect(h.state.get('a')?.state).toBe('creating');
    expect(first.exitCode).toBe(4);
    expect(first.nextCommand).toBe('mux migrate run --yes');

    const second = await h.run();

    expect(second.exitCode).toBe(0);
    expect(h.mux.assetsWithExternalId('manifest:a')).toHaveLength(1);
  });

  test('on resume, an item left in creating adopts a matching asset from the recent asset list', async () => {
    const h = harness([sourceItem('a')]);
    const startedAt = h.clock.now();
    seedCreating(h, startedAt);
    const existing = h.mux.injectAsset(
      { external_id: 'manifest:a' },
      startedAt + 1000,
    );
    h.mux.markReady(existing.id);

    const result = await h.run();

    expect(h.mux.createCalls).toHaveLength(0);
    expect(h.state.get('a')).toMatchObject({
      state: 'ready',
      assetId: existing.id,
    });
    expect(result.exitCode).toBe(0);
  });

  test('on resume, an asset from an earlier migration of the same source is not adopted', async () => {
    const h = harness([sourceItem('a')]);
    const startedAt = h.clock.now();
    const old = h.mux.injectAsset(
      { external_id: 'manifest:a' },
      startedAt - 24 * 60 * MINUTE,
    );
    seedCreating(h, startedAt);

    await h.run();

    expect(h.mux.createCalls).toHaveLength(1);
    expect(h.state.get('a')?.assetId).not.toBe(old.id);
  });

  test('on resume, an item left in creating with no matching asset is created again', async () => {
    const h = harness([sourceItem('a')]);
    seedCreating(h, h.clock.now());

    const result = await h.run();

    expect(h.mux.createCalls).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  test('a second asset with the same external ID is reported as DUPLICATE_ASSET and not deleted', async () => {
    const h = harness([sourceItem('a')]);
    let twinId = '';
    h.mux.afterCreate = (_asset, params) => {
      twinId = h.mux.injectAsset({ external_id: params.meta?.external_id }).id;
    };

    const result = await h.run();

    const kept = h.state.get('a')?.assetId;
    expect(kept).toBeDefined();
    expect(kept).not.toBe(twinId);
    expect(result.duplicates).toEqual([
      { sourceId: 'a', keptAssetId: kept as string, duplicateAssetId: twinId },
    ]);
    expect(h.mux.deleted).toHaveLength(0);
    expect(h.emitted).toContainEqual(
      expect.objectContaining({ type: 'warning', code: 'DUPLICATE_ASSET' }),
    );
  });

  describe('crash and resume', () => {
    test.each([
      'resolved',
      'creating',
      'processing',
    ] as const)('a crash right after an item reaches %s resumes with exactly one asset per item', async (crashState) => {
      const items = ['a', 'b', 'c'].map((id) => sourceItem(id));
      const h = harness(items);
      const snapshotPath = join(tempDir, 'snapshot.db');
      h.mux.autoReady = crashState !== 'processing';
      h.deps.emit = (event) => {
        if (h.mux.dead) return;
        if (
          event.type === 'item' &&
          event.source_id === 'b' &&
          event.state === crashState
        ) {
          snapshotState(h.statePath, snapshotPath);
          h.mux.dead = true;
          throw new SimulatedCrash();
        }
      };

      await h.run().catch(() => {});
      h.state.close();
      h.mux.dead = false;
      h.mux.autoReady = true;
      for (const asset of h.mux.assets) {
        if (asset.status !== 'ready') h.mux.markReady(asset.id);
      }

      const resumed = harness(items, snapshotPath);
      resumed.mux.assets = h.mux.assets;
      const result = await resumed.run();

      expect(result.exitCode).toBe(0);
      for (const id of ['a', 'b', 'c']) {
        expect(resumed.mux.assetsWithExternalId(`manifest:${id}`)).toHaveLength(
          1,
        );
        expect(resumed.state.get(id)?.state).toBe('ready');
      }
    });

    test('a crash after Mux created the asset but before the response was saved adopts that asset', async () => {
      const h = harness([sourceItem('a')]);
      const snapshotPath = join(tempDir, 'snapshot.db');
      h.mux.afterCreate = () => {
        snapshotState(h.statePath, snapshotPath);
        h.mux.dead = true;
      };

      await h.run().catch(() => {});
      h.state.close();
      h.mux.dead = false;

      const resumed = harness([sourceItem('a')], snapshotPath);
      resumed.mux.assets = h.mux.assets;
      const result = await resumed.run();

      expect(result.exitCode).toBe(0);
      expect(resumed.mux.createCalls).toHaveLength(0);
      expect(resumed.state.get('a')?.assetId).toBe(h.mux.assets[0].id);
    });
  });
});

describe('event stream', () => {
  test('opens the stream before the first create request', async () => {
    const h = harness([sourceItem('a')]);
    let openedBeforeCreate = false;
    h.mux.beforeCreate = () => {
      openedBeforeCreate = h.stream.opened > 0;
    };

    await h.run();

    expect(openedBeforeCreate).toBe(true);
  });

  test('reconciles in-flight items after a reconnect when events were missed', async () => {
    const h = harness([sourceItem('a')]);
    h.mux.beforeCreate = () => h.stream.goOffline();
    h.mux.afterCreate = () => setTimeout(() => h.stream.reconnect(), 5);

    const result = await h.run();

    expect(h.state.get('a')?.state).toBe('ready');
    expect(result.exitCode).toBe(0);
  });

  test('ignores events for assets that are not part of the migration', async () => {
    const h = harness([sourceItem('a')]);
    let createdId = '';
    h.mux.beforeCreate = () => {
      h.mux.injectAsset({ external_id: 'vimeo:a' });
      h.mux.injectAsset({});
    };
    h.mux.afterCreate = (asset) => {
      createdId = asset.id;
    };

    const result = await h.run();

    expect(result.exitCode).toBe(0);
    expect(result.duplicates).toHaveLength(0);
    expect(h.state.get('a')?.assetId).toBe(createdId);
  });

  test('emits each item transition and ends with a summary', async () => {
    const h = harness([sourceItem('a')]);

    await h.run();

    expect(statesFor(h.emitted, 'a')).toEqual([
      'resolved',
      'creating',
      'processing',
      'ready',
    ]);
    const ready = h.emitted.find(
      (e) => e.type === 'item' && e.state === 'ready',
    );
    expect(ready).toMatchObject({
      asset_id: expect.any(String),
      playback_id: expect.any(String),
    });
    expect(h.emitted.at(-1)).toMatchObject({
      type: 'summary',
      ready: 1,
      errored: 0,
      remaining: 0,
    });
  });
});

describe('Robots directives', () => {
  function withDirective(h: ReturnType<typeof harness>) {
    h.mux.directives.set('drv_1', {
      id: 'drv_1',
      name: 'Chapters and summary',
      workflows: ['generate-chapters', 'summarize'],
    });
  }

  test('attaches configured directives on create and records each run', async () => {
    const h = harness([sourceItem('a')]);
    withDirective(h);

    const result = await h.run({ directives: ['drv_1'] });

    expect(h.mux.createCalls[0].directives).toEqual([{ id: 'drv_1' }]);
    expect(statesFor(h.emitted, 'a')).toEqual([
      'resolved',
      'creating',
      'processing',
      'enriching',
      'ready',
    ]);
    expect(h.state.get('a')?.directiveRuns).toEqual([
      expect.objectContaining({ directiveId: 'drv_1', status: 'completed' }),
    ]);
    expect(result.exitCode).toBe(0);
  });

  test('--skip-robots creates assets without directives', async () => {
    const h = harness([sourceItem('a')]);
    withDirective(h);

    await h.run({ directives: ['drv_1'], skipRobots: true });

    expect(h.mux.createCalls[0].directives).toBeUndefined();
    expect(h.state.get('a')?.state).toBe('ready');
  });

  test('an unknown directive fails with DIRECTIVE_NOT_FOUND before any asset is created', async () => {
    const h = harness([sourceItem('a')]);

    const result = await h.run({ directives: ['drv_missing'] });

    expect(result.error?.code).toBe('DIRECTIVE_NOT_FOUND');
    expect(result.exitCode).toBe(2);
    expect(h.mux.createCalls).toHaveLength(0);
  });

  test('a partial directive run keeps the asset, warns, and does not fail the migration', async () => {
    const h = harness([sourceItem('a')]);
    withDirective(h);
    h.mux.directiveOutcome = 'partial';

    const result = await h.run({ directives: ['drv_1'] });

    expect(h.state.get('a')).toMatchObject({
      state: 'ready',
      directiveRuns: [expect.objectContaining({ status: 'partial' })],
    });
    expect(result.exitCode).toBe(0);
    expect(h.emitted).toContainEqual(
      expect.objectContaining({ type: 'warning', code: 'DIRECTIVE_RUN_PARTIAL' }),
    );
  });

  test('directive run results missed while offline are recovered after reconnect', async () => {
    const h = harness([sourceItem('a')]);
    withDirective(h);
    h.mux.autoReady = false;
    h.mux.afterCreate = (asset) => {
      h.stream.goOffline();
      h.mux.markReady(asset.id);
      setTimeout(() => h.stream.reconnect(), 5);
    };

    const result = await h.run({ directives: ['drv_1'] });

    expect(h.state.get('a')?.directiveRuns).toEqual([
      expect.objectContaining({ status: 'completed' }),
    ]);
    expect(result.exitCode).toBe(0);
  });
});
