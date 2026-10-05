import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MigrationFailure } from './errors.ts';
import { DEFAULT_RECIPE_PATH, type Recipe } from './recipe.ts';

const AVAILABLE_PROVIDERS = ['manifest'];
const STATE_DIRECTORY = '.mux-migrate/';

function starterRecipe(provider: string): Recipe {
  return {
    provider,
    source: { manifest: './videos.json' },
    asset: { playback_policy: ['public'], video_quality: 'basic' },
    captions: { import: true, host_bucket: null },
    directives: [],
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
): Promise<{ recipe: string; next_command: string }> {
  if (!AVAILABLE_PROVIDERS.includes(provider)) {
    throw new MigrationFailure({
      code: 'PROVIDER_NOT_AVAILABLE',
      message: `The ${provider} provider is not available in this version of the CLI.`,
      hint: `Available providers: ${AVAILABLE_PROVIDERS.join(', ')}.`,
    });
  }

  const recipePath = join(cwd, DEFAULT_RECIPE_PATH);
  if (!options.force && (await exists(recipePath))) {
    throw new MigrationFailure({
      code: 'RECIPE_EXISTS',
      message: `${recipePath} already exists.`,
      hint: 'Edit it directly, or pass --force to replace it.',
    });
  }
  await writeFile(
    recipePath,
    `${JSON.stringify(starterRecipe(provider), null, 2)}\n`,
  );

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

  return { recipe: recipePath, next_command: 'mux migrate plan' };
}
