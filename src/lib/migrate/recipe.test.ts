import { describe, expect, test } from 'bun:test';
import { recipeHash } from './recipe.ts';

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
