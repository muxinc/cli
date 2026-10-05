import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initMigration } from './init.ts';
import { loadRecipe } from './recipe.ts';

describe('initMigration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-init-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes a starter recipe that loads, and points at plan', async () => {
    const result = await initMigration('manifest', dir);

    expect(result.recipe).toBe(join(dir, 'mux-migrate.json'));
    expect(result.next_command).toBe('mux migrate plan');
    expect(await loadRecipe(undefined, dir)).toMatchObject({
      provider: 'manifest',
      source: { manifest: expect.any(String) },
    });
  });

  test('adds .mux-migrate/ to .gitignore once', async () => {
    await writeFile(join(dir, '.gitignore'), 'node_modules\n');

    await initMigration('manifest', dir);
    await initMigration('manifest', dir, { force: true });

    const gitignore = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(gitignore.match(/^\.mux-migrate\/$/gm)).toHaveLength(1);
    expect(gitignore).toStartWith('node_modules\n');
  });

  test('refuses to overwrite an existing recipe without force', async () => {
    await initMigration('manifest', dir);

    await expect(initMigration('manifest', dir)).rejects.toMatchObject({
      code: 'RECIPE_EXISTS',
    });
  });

  test('lists the credentials the provider needs', async () => {
    const result = await initMigration('vimeo', dir);

    expect(result.credentials).toEqual([
      expect.objectContaining({ name: 'VIMEO_ACCESS_TOKEN', required: true }),
    ]);
    expect(await loadRecipe(undefined, dir)).toMatchObject({
      provider: 'vimeo',
      source: { include_private: true },
    });
  });

  test('rejects unknown providers', async () => {
    await expect(initMigration('youtube', dir)).rejects.toMatchObject({
      code: 'PROVIDER_UNKNOWN',
    });
  });
});
