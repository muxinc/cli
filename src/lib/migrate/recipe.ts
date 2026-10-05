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
