import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executeExport,
  executePlan,
  executeRetry,
  executeRun,
  executeStatus,
  executeVerify,
  type MigrateContext,
} from './cli.ts';
import { type Recipe, recipeHash } from './recipe.ts';
import { MigrationState } from './state.ts';
import {
  FakeClock,
  FakeEventSource,
  FakeMux,
  FakeProvider,
  sourceItem,
} from './testing/fakes.ts';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-cli-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function context(
  options: { json?: boolean; recipe?: Recipe; ids?: string[] } = {},
) {
  const clock = new FakeClock();
  const stream = new FakeEventSource();
  const mux = new FakeMux(clock, stream);
  const provider = new FakeProvider(
    (options.ids ?? ['a', 'b']).map((id) => sourceItem(id)),
  );
  const state = MigrationState.open(join(tempDir, 'state.db'));
  const out: string[] = [];
  const err: string[] = [];
  const ctx: MigrateContext = {
    deps: {
      state,
      provider,
      credentials: undefined,
      mux,
      events: stream,
      clock,
    },
    recipe: options.recipe,
    io: {
      json: options.json ?? true,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    },
  };
  const json = () => out.map((line) => JSON.parse(line));
  return { ctx, mux, state, provider, out, err, json };
}

describe('executeRun', () => {
  test('prints one JSON object per line, ending with the summary', async () => {
    const c = context();

    const code = await executeRun({ yes: true, concurrency: 1 }, c.ctx);

    expect(code).toBe(0);
    for (const line of c.out) expect(line).not.toContain('\n');
    const events = c.json();
    expect(events.filter((e) => e.type === 'item').length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({
      type: 'summary',
      ready: 2,
      remaining: 0,
    });
  });

  test('without --yes prints the plan and a summary pointing at the confirmed command, and exits 3', async () => {
    const c = context();

    const code = await executeRun({}, c.ctx);

    expect(code).toBe(3);
    expect(c.mux.createCalls).toHaveLength(0);
    const events = c.json();
    expect(events[0]).toMatchObject({ type: 'plan', total: 2 });
    expect(events.at(-1)).toMatchObject({
      type: 'summary',
      remaining: 2,
      next_command: 'mux migrate run --yes',
    });
  });

  test('prints a configuration error with its code and hint, and exits 2', async () => {
    const c = context();

    const code = await executeRun(
      { yes: true, directive: ['drv_missing'] },
      c.ctx,
    );

    expect(code).toBe(2);
    expect(c.json()).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'DIRECTIVE_NOT_FOUND',
        message: expect.any(String),
        hint: expect.any(String),
      }),
    );
  });

  test('rejects an invalid --time-budget before doing any work', async () => {
    const c = context();

    const code = await executeRun({ yes: true, timeBudget: 'soon' }, c.ctx);

    expect(code).toBe(2);
    expect(c.json()).toEqual([
      expect.objectContaining({ type: 'error', code: 'INVALID_DURATION' }),
    ]);
    expect(c.state.list()).toHaveLength(0);
  });

  test('reports an unexpected failure as an error line and exits 1', async () => {
    const c = context();
    c.mux.beforeCreate = () => {
      throw new Error('disk full');
    };

    const code = await executeRun({ yes: true }, c.ctx);

    expect(code).toBe(1);
    expect(c.json().at(-1)).toMatchObject({
      type: 'error',
      code: 'UNEXPECTED_ERROR',
      message: expect.stringContaining('disk full'),
      next_command: 'mux migrate run --yes',
    });
  });

  test('uses recipe settings, with flags taking precedence', async () => {
    const recipe: Recipe = {
      provider: 'manifest',
      asset: { playback_policy: ['signed'], video_quality: 'basic' },
      directives: ['drv_recipe'],
    };
    const c = context({ recipe });
    for (const id of ['drv_recipe', 'drv_flag']) {
      c.mux.directives.set(id, { id, name: id, workflows: [] });
    }

    await executeRun(
      { yes: true, concurrency: 1, videoQuality: 'plus', test: true },
      c.ctx,
    );
    const fromRecipe = c.mux.createCalls[0];

    expect(fromRecipe).toMatchObject({
      playback_policies: ['signed'],
      video_quality: 'plus',
      test: true,
      directives: [{ id: 'drv_recipe' }],
    });
    expect(c.state.get('a')?.recipeHash).toBe(recipeHash(recipe));
  });

  test('--directive replaces the recipe directives', async () => {
    const c = context({ recipe: { directives: ['drv_recipe'] }, ids: ['a'] });
    c.mux.directives.set('drv_flag', {
      id: 'drv_flag',
      name: 'flag',
      workflows: [],
    });

    await executeRun({ yes: true, directive: ['drv_flag'] }, c.ctx);

    expect(c.mux.createCalls[0].directives).toEqual([{ id: 'drv_flag' }]);
  });

  test('--ids accepts a comma-separated list', async () => {
    const c = context({ ids: ['a', 'b', 'c'] });

    await executeRun({ yes: true, ids: 'a, c' }, c.ctx);

    expect(c.mux.createCalls.map((p) => p.meta?.external_id)).toEqual([
      'manifest:a',
      'manifest:c',
    ]);
  });

  test('human output summarizes the run and prints the next command', async () => {
    const c = context({ json: false, ids: ['a', 'b', 'c'] });

    const code = await executeRun({ yes: true, limit: 1 }, c.ctx);
    const text = c.out.join('\n');

    expect(code).toBe(4);
    expect(() => JSON.parse(c.out.at(-1) ?? '')).toThrow();
    expect(text).toMatch(/ready\D+1/i);
    expect(text).toContain('mux migrate run --yes --limit 1');
  });
});

describe('executePlan', () => {
  test('prints the inventory as one JSON document', async () => {
    const c = context();

    const code = await executePlan(c.ctx);

    expect(code).toBe(0);
    expect(c.out).toHaveLength(1);
    expect(JSON.parse(c.out[0])).toMatchObject({
      total: 2,
      added: 2,
      exportable: 2,
      skipped: 0,
    });
  });
});

describe('executeStatus', () => {
  test('prints the status report and exits with its code', async () => {
    const c = context();
    await executeRun({ yes: true, limit: 1 }, c.ctx);
    c.out.length = 0;

    const code = executeStatus(c.ctx);

    expect(code).toBe(4);
    expect(JSON.parse(c.out.join('\n'))).toMatchObject({
      counts: { ready: 1, discovered: 1 },
      next_command: 'mux migrate run --yes',
    });
  });
});

describe('executeRetry', () => {
  test('re-queues errored items and points at the run command', async () => {
    const c = context();
    c.state.initMigration('manifest');
    c.state.upsertDiscovered([sourceItem('a')]);
    c.state.update('a', {
      state: 'errored',
      error: { code: 'X', message: 'x' },
    });

    const code = executeRetry({}, c.ctx);

    expect(code).toBe(0);
    expect(JSON.parse(c.out.join('\n'))).toEqual({
      requeued: 1,
      next_command: 'mux migrate run --yes',
    });
    expect(c.state.get('a')?.state).toBe('discovered');
  });
});

describe('executeExport', () => {
  test('prints the JSON mapping of ready items by default', async () => {
    const c = context();
    await executeRun({ yes: true, limit: 1 }, c.ctx);
    c.out.length = 0;

    const code = executeExport({}, c.ctx);

    expect(code).toBe(0);
    const mapping = JSON.parse(c.out.join('\n'));
    expect(
      mapping.items.map((i: { source_id: string }) => i.source_id),
    ).toEqual(['a']);
  });

  test('prints CSV with --format csv', async () => {
    const c = context();
    await executeRun({ yes: true }, c.ctx);
    c.out.length = 0;

    executeExport({ format: 'csv' }, c.ctx);

    expect(c.out.join('\n')).toStartWith('source_id,source_url,title');
  });
});

describe('executeVerify', () => {
  test('prints the verify report and exits with its code', async () => {
    const c = context({ ids: ['a'] });
    await executeRun({ yes: true }, c.ctx);
    c.out.length = 0;

    const code = await executeVerify(
      {},
      {
        ...c.ctx,
        fetch: (async () => new Response('#EXTM3U')) as unknown as typeof fetch,
      },
    );

    expect(code).toBe(0);
    expect(JSON.parse(c.out.join('\n'))).toMatchObject({
      checked: 1,
      passed: 1,
      next_command: 'mux migrate export',
    });
  });
});
