import { createHash } from 'node:crypto';

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
  directives?: string[];
}

export const DEFAULT_RECIPE_PATH = 'mux-migrate.json';

/**
 * Loads the recipe at `path`, or `mux-migrate.json` in `cwd` when present.
 * Returns undefined when no path is given and no default file exists.
 */
export async function loadRecipe(
  _path: string | undefined,
  _cwd: string,
): Promise<Recipe | undefined> {
  throw new Error('Not implemented');
}

/** Parses a duration such as `90s`, `8m`, or `1h` into milliseconds. */
export function parseDuration(_text: string): number {
  throw new Error('Not implemented');
}
