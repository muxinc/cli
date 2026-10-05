import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecipe, parseDuration, recipeHash } from './recipe.ts';

describe('recipeHash', () => {
  const recipe = {
    provider: 'vimeo',
    asset: { playback_policy: ['public'], video_quality: 'basic' },
    directives: ['drv_1'],
  };

  test('is stable regardless of key order', () => {
    const reordered = {
      directives: ['drv_1'],
      asset: { video_quality: 'basic', playback_policy: ['public'] },
      provider: 'vimeo',
    };
    expect(recipeHash(reordered)).toBe(recipeHash(recipe));
  });

  test('changes when a value changes', () => {
    const changed = {
      ...recipe,
      asset: { ...recipe.asset, video_quality: 'plus' },
    };
    expect(recipeHash(changed)).not.toBe(recipeHash(recipe));
  });

  test('treats array order as significant', () => {
    expect(recipeHash({ directives: ['a', 'b'] })).not.toBe(
      recipeHash({ directives: ['b', 'a'] }),
    );
  });
});

describe('loadRecipe', () => {
  async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-recipe-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  test('returns undefined when no recipe exists and none was asked for', async () => {
    await withDir(async (dir) => {
      expect(await loadRecipe(undefined, dir)).toBeUndefined();
    });
  });

  test('reads mux-migrate.json from the working directory by default', async () => {
    await withDir(async (dir) => {
      await writeFile(
        join(dir, 'mux-migrate.json'),
        JSON.stringify({ provider: 'manifest', directives: ['drv_1'] }),
      );
      expect(await loadRecipe(undefined, dir)).toMatchObject({
        provider: 'manifest',
        directives: ['drv_1'],
      });
    });
  });

  test('fails with RECIPE_NOT_FOUND when an explicit path is missing', async () => {
    await withDir(async (dir) => {
      await expect(
        loadRecipe(join(dir, 'missing.json'), dir),
      ).rejects.toMatchObject({
        code: 'RECIPE_NOT_FOUND',
      });
    });
  });

  test.each([
    ['invalid JSON', '{'],
    ['a non-object', '[]'],
    ['directives that are not strings', JSON.stringify({ directives: [1] })],
    ['an unknown provider', JSON.stringify({ provider: 'youtube' })],
  ])('fails with RECIPE_INVALID for %s', async (_name, content) => {
    await withDir(async (dir) => {
      const path = join(dir, 'recipe.json');
      await writeFile(path, content);
      await expect(loadRecipe(path, dir)).rejects.toMatchObject({
        code: 'RECIPE_INVALID',
      });
    });
  });
});

describe('parseDuration', () => {
  test.each([
    ['90s', 90_000],
    ['8m', 480_000],
    ['1h', 3_600_000],
    ['1h30m', 5_400_000],
  ])('parses %s', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  test.each([
    '',
    'soon',
    '10',
    '-5m',
    '0m',
  ])('rejects %p with INVALID_DURATION', (text) => {
    expect(() => parseDuration(text)).toThrow(
      expect.objectContaining({ code: 'INVALID_DURATION' }),
    );
  });
});
