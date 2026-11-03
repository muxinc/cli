import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MigrationFailure } from './errors.ts';
import type { ProviderId } from './types.ts';

const PROVIDERS: ProviderId[] = [
  'vimeo',
  'cloudflare-stream',
  'bunny',
  'wistia',
  'bucket',
  'manifest',
];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

/** A stable hash of a recipe's content, independent of key order. */
export function recipeHash(recipe: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(recipe)))
    .digest('hex')
    .slice(0, 16);
}

export interface Recipe {
  provider?: string;
  source?: { manifest?: string } & Record<string, unknown>;
  asset?: {
    playback_policy?: Array<'public' | 'signed' | 'drm'>;
    video_quality?: 'basic' | 'plus' | 'premium';
    max_resolution_tier?: '1080p' | '1440p' | '2160p';
  };
  captions?: { import?: boolean; host_bucket?: string | null };
}

export const DEFAULT_RECIPE_PATH = 'mux-migrate.json';

/**
 * Loads the recipe at `path`, or `mux-migrate.json` in `cwd` when present.
 * Returns undefined when no path is given and no default file exists.
 */
export async function loadRecipe(
  path: string | undefined,
  cwd: string,
): Promise<Recipe | undefined> {
  const recipePath = resolve(cwd, path ?? join(cwd, DEFAULT_RECIPE_PATH));
  let text: string;
  try {
    text = await readFile(recipePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (path === undefined) return undefined;
    throw new MigrationFailure({
      code: 'RECIPE_NOT_FOUND',
      message: `Recipe file not found: ${recipePath}`,
      hint: 'Create one with `mux migrate init <provider>`, or omit --recipe.',
    });
  }

  const invalid = (reason: string) =>
    new MigrationFailure({
      code: 'RECIPE_INVALID',
      message: `${recipePath} is not a valid recipe: ${reason}`,
    });

  let recipe: unknown;
  try {
    recipe = JSON.parse(text);
  } catch (error) {
    throw invalid((error as Error).message);
  }
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw invalid('expected a JSON object.');
  }
  const { provider } = recipe as Recipe;
  if (provider !== undefined && !PROVIDERS.includes(provider as ProviderId)) {
    throw invalid(
      `unknown provider "${provider}". Supported providers: ${PROVIDERS.join(', ')}.`,
    );
  }
  if ('directives' in recipe) {
    throw invalid(
      'Robots directives are not supported by mux migrate yet. Remove the "directives" field, and attach directives to the migrated assets from the Mux Dashboard instead.',
    );
  }
  return recipe as Recipe;
}

const DURATION_UNITS = { h: 3_600_000, m: 60_000, s: 1000 } as const;

/** Parses a duration such as `90s`, `8m`, or `1h` into milliseconds. */
export function parseDuration(text: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim());
  const ms = match
    ? Number(match[1] ?? 0) * DURATION_UNITS.h +
      Number(match[2] ?? 0) * DURATION_UNITS.m +
      Number(match[3] ?? 0) * DURATION_UNITS.s
    : 0;
  if (ms <= 0) {
    throw new MigrationFailure({
      code: 'INVALID_DURATION',
      message: `"${text}" is not a valid duration.`,
      hint: 'Use a positive duration with a unit, such as 90s, 8m, or 1h.',
    });
  }
  return ms;
}
