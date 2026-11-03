import { describe, expect, test } from 'bun:test';
import { createProvider, providerCredentials, providerIds } from './index.ts';

describe('provider registry', () => {
  test('lists every provider in the spec', () => {
    expect(providerIds()).toEqual([
      'vimeo',
      'cloudflare-stream',
      'bunny',
      'wistia',
      'bucket',
      'manifest',
    ]);
  });

  test('creates the manifest provider from the recipe source', () => {
    const provider = createProvider('manifest', {
      recipe: { source: { manifest: 'videos.json' } },
      cwd: '/work',
    });
    expect(provider.id).toBe('manifest');
  });

  test('a --manifest path takes precedence over the recipe', () => {
    expect(() =>
      createProvider('manifest', { recipe: {}, cwd: '/work' }),
    ).toThrow(expect.objectContaining({ code: 'MANIFEST_PATH_REQUIRED' }));
    expect(
      createProvider('manifest', {
        recipe: {},
        cwd: '/work',
        manifestPath: 'v.csv',
      }).id,
    ).toBe('manifest');
  });

  test('creates the vimeo provider', () => {
    expect(createProvider('vimeo', { recipe: {}, cwd: '/work' }).id).toBe(
      'vimeo',
    );
  });

  test('rejects unknown providers', () => {
    expect(() =>
      createProvider('youtube', { recipe: {}, cwd: '/work' }),
    ).toThrow(expect.objectContaining({ code: 'PROVIDER_UNKNOWN' }));
  });

  test('reads credentials from the environment, with --credential values taking precedence', () => {
    const provider = createProvider('vimeo', { recipe: {}, cwd: '/work' });

    expect(
      providerCredentials(provider, { VIMEO_ACCESS_TOKEN: 'from-env' }, [
        'VIMEO_ACCESS_TOKEN=from-flag',
      ]),
    ).toEqual({ accessToken: 'from-flag' });
  });

  test('rejects a malformed --credential value', () => {
    const provider = createProvider('vimeo', { recipe: {}, cwd: '/work' });

    expect(() =>
      providerCredentials(provider, {}, ['VIMEO_ACCESS_TOKEN']),
    ).toThrow(expect.objectContaining({ code: 'CREDENTIAL_FLAG_INVALID' }));
  });
});
