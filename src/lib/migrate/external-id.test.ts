import { describe, expect, test } from 'bun:test';
import { ExternalIds } from './external-id.ts';

describe('ExternalIds', () => {
  test('uses {provider}:{source_id} when it fits in 128 characters', () => {
    const ids = new ExternalIds('vimeo', ['123']);

    expect(ids.for('123')).toBe('vimeo:123');
    expect(ids.sourceIdFor('vimeo:123')).toBe('123');
  });

  test('hashes source IDs that would exceed 128 characters, and maps them back', () => {
    const long = `folder/${'a'.repeat(200)}.mp4`;
    const ids = new ExternalIds('bucket', [long, 'short.mp4']);

    const externalId = ids.for(long);

    expect([...externalId].length).toBeLessThanOrEqual(128);
    expect(externalId).toMatch(/^bucket:sha256:[0-9a-f]{64}$/);
    expect(ids.sourceIdFor(externalId)).toBe(long);
    expect(new ExternalIds('bucket', [long]).for(long)).toBe(externalId);
  });

  test('ignores external IDs from other providers or unknown hashes', () => {
    const ids = new ExternalIds('vimeo', ['123']);

    expect(ids.sourceIdFor('wistia:123')).toBeUndefined();
    expect(ids.sourceIdFor(`vimeo:sha256:${'0'.repeat(64)}`)).toBeUndefined();
    expect(ids.sourceIdFor(undefined)).toBeUndefined();
  });

  test('counts code points, not UTF-16 units', () => {
    const emoji = '🎬'.repeat(60);
    const ids = new ExternalIds('manifest', [emoji]);

    expect(ids.for(emoji)).toBe(`manifest:${emoji}`);
  });
});
