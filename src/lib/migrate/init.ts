import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MigrationFailure } from './errors.ts';
import { createProvider, starterSource } from './providers/index.ts';
import { DEFAULT_RECIPE_PATH, type Recipe } from './recipe.ts';

const STATE_DIRECTORY = '.mux-migrate/';

function starterRecipe(provider: string): Recipe {
  return {
    provider,
    source: starterSource(provider),
    asset: { playback_policy: ['public'], video_quality: 'basic' },
    captions: { import: true, host_bucket: null },
  };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Writes a starter recipe and keeps the state directory out of git. */
export async function initMigration(
  provider: string,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<{
  recipe: string;
  credentials: Array<{ name: string; required: boolean; description: string }>;
  next_command: string;
}> {
  const recipe = starterRecipe(provider);
  const { variables } = createProvider(provider, {
    recipe,
    cwd,
    manifestPath: recipe.source?.manifest ?? 'manifest.json',
  }).credentials;

  const recipePath = join(cwd, DEFAULT_RECIPE_PATH);
  if (!options.force && (await exists(recipePath))) {
    throw new MigrationFailure({
      code: 'RECIPE_EXISTS',
      message: `${recipePath} already exists.`,
      hint: 'Edit it directly, or pass --force to replace it.',
    });
  }
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);

  const gitignorePath = join(cwd, '.gitignore');
  const gitignore = (await exists(gitignorePath))
    ? await readFile(gitignorePath, 'utf-8')
    : '';
  if (!gitignore.split(/\r?\n/).includes(STATE_DIRECTORY)) {
    const separator = gitignore === '' || gitignore.endsWith('\n') ? '' : '\n';
    await writeFile(
      gitignorePath,
      `${gitignore}${separator}${STATE_DIRECTORY}\n`,
    );
  }

  return {
    recipe: recipePath,
    credentials: variables,
    next_command: 'mux migrate plan',
  };
}
