import { describe, expect, it } from 'bun:test';
import {
  type Environment,
  environmentSettings,
  flagCredential,
  getPreferredCredential,
  hasOAuth,
  hasTokenPair,
  normalizeEnvironment,
  summarizeEnvironment,
} from './credentials.ts';

const OAUTH = {
  accessToken: 'access_1',
  refreshToken: 'refresh_1',
  expiresAt: 1_900_000_000,
};
const PAIR = { tokenId: 'id_1', tokenSecret: 'secret_1' };

describe('normalizeEnvironment', () => {
  it('reads a flat entry as a token block', () => {
    // The layout every released version wrote: credentials at the top level.
    const normalized = normalizeEnvironment({
      tokenId: 'id_1',
      tokenSecret: 'secret_1',
      environmentId: 'env_123',
      signingKeyId: 'key_1',
    });

    expect(normalized.token).toEqual(PAIR);
    expect(normalized.oauth).toBeUndefined();
    expect(normalized.environmentId).toBe('env_123');
    expect(normalized.signingKeyId).toBe('key_1');
  });

  it('reads a flat entry tagged type: token as a token block', () => {
    const normalized = normalizeEnvironment({
      type: 'token',
      tokenId: 'id_1',
      tokenSecret: 'secret_1',
    });

    expect(normalized.token).toEqual(PAIR);
  });

  it('reads a flat type: oauth entry as an oauth block', () => {
    const normalized = normalizeEnvironment({
      type: 'oauth',
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: 1_900_000_000,
      scope: 'video:read',
      tokenType: 'Bearer',
      environmentId: 'env_123',
      environmentName: 'Production',
      organizationName: 'Acme Inc',
    });

    expect(normalized.oauth).toEqual({
      ...OAUTH,
      scope: 'video:read',
      tokenType: 'Bearer',
    });
    expect(normalized.token).toBeUndefined();
    expect(normalized.environmentName).toBe('Production');
    expect(normalized.organizationName).toBe('Acme Inc');
  });

  it('leaves an already-nested entry untouched', () => {
    const entry: Environment = {
      environmentId: 'env_123',
      oauth: OAUTH,
      token: PAIR,
    };

    expect(normalizeEnvironment(entry)).toEqual(entry);
  });

  it('drops the discriminator and flat credential fields once nested', () => {
    const normalized = normalizeEnvironment({
      type: 'oauth',
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: 1,
    }) as Record<string, unknown>;

    expect(normalized.type).toBeUndefined();
    expect(normalized.accessToken).toBeUndefined();
    expect(normalized.refreshToken).toBeUndefined();
    expect(normalized.expiresAt).toBeUndefined();
  });

  it('keeps both blocks when a flat entry somehow carries both', () => {
    const normalized = normalizeEnvironment({
      tokenId: 'id_1',
      tokenSecret: 'secret_1',
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: 1_900_000_000,
    });

    expect(normalized.token).toEqual(PAIR);
    expect(normalized.oauth).toEqual(OAUTH);
  });

  it('produces an entry with no credentials rather than throwing on junk', () => {
    const normalized = normalizeEnvironment({ environmentId: 'env_123' });

    expect(normalized.oauth).toBeUndefined();
    expect(normalized.token).toBeUndefined();
    expect(normalized.environmentId).toBe('env_123');
  });

  it('ignores a partial token pair', () => {
    // Half a pair cannot authenticate anything, so it is not a credential.
    expect(normalizeEnvironment({ tokenId: 'id_1' }).token).toBeUndefined();
  });
});

describe('environmentSettings', () => {
  it('carries every setting that belongs to the environment', () => {
    const settings = environmentSettings({
      signingKeyId: 'key_1',
      signingPrivateKey: 'private_1',
      forwardUrl: 'http://localhost:3000/webhooks',
      baseUrl: 'https://api.custom.example',
      // Identity and credentials are not settings: they come from the grant or
      // the credential itself.
      environmentId: 'env_123',
      organizationName: 'Acme Inc',
      oauth: OAUTH,
      token: PAIR,
    });

    expect(settings).toEqual({
      signingKeyId: 'key_1',
      signingPrivateKey: 'private_1',
      forwardUrl: 'http://localhost:3000/webhooks',
      baseUrl: 'https://api.custom.example',
    });
  });

  it('includes the bound API host, which a re-login must not silently reset', () => {
    expect(
      environmentSettings({ baseUrl: 'https://api.custom.example' }),
    ).toEqual({ baseUrl: 'https://api.custom.example' });
  });

  it('omits absent fields rather than writing undefined', () => {
    expect(environmentSettings({ environmentId: 'env_123' })).toEqual({});
  });
});

describe('getPreferredCredential', () => {
  it('prefers OAuth when both are present', () => {
    // OAuth goes stale unless refreshed, so the CLI must exercise it rather
    // than quietly living on the token pair.
    const preferred = getPreferredCredential({ oauth: OAUTH, token: PAIR });

    expect(preferred?.kind).toBe('oauth');
  });

  it('uses the token pair when there is no OAuth block', () => {
    expect(getPreferredCredential({ token: PAIR })?.kind).toBe('token');
  });

  it('uses OAuth when there is no token pair', () => {
    expect(getPreferredCredential({ oauth: OAUTH })?.kind).toBe('oauth');
  });

  it('falls back to the token pair when OAuth is flagged dead', () => {
    const preferred = getPreferredCredential({
      oauth: { ...OAUTH, lastError: { code: 'invalid_grant', at: 'now' } },
      token: PAIR,
    });

    expect(preferred?.kind).toBe('token');
  });

  it('still returns flagged OAuth when it is the only credential', () => {
    // Better to try and fail with a real API error than to claim there are no
    // credentials at all.
    const preferred = getPreferredCredential({
      oauth: { ...OAUTH, lastError: { code: 'invalid_grant', at: 'now' } },
    });

    expect(preferred?.kind).toBe('oauth');
  });

  it('prefers OAuth over a flagged token pair', () => {
    const preferred = getPreferredCredential({
      oauth: OAUTH,
      token: { ...PAIR, lastError: { code: '401', at: 'now' } },
    });

    expect(preferred?.kind).toBe('oauth');
  });

  it('returns null when an entry holds no credentials', () => {
    expect(getPreferredCredential({ environmentId: 'env_123' })).toBeNull();
  });
});

describe('hasOAuth / hasTokenPair', () => {
  it('detect each block independently', () => {
    expect(hasOAuth({ oauth: OAUTH })).toBe(true);
    expect(hasOAuth({ token: PAIR })).toBe(false);
    expect(hasTokenPair({ token: PAIR })).toBe(true);
    expect(hasTokenPair({ oauth: OAUTH })).toBe(false);
  });
});

describe('flagCredential', () => {
  it('records the failure on the named block without touching the other', () => {
    const flagged = flagCredential({ oauth: OAUTH, token: PAIR }, 'oauth', {
      code: 'invalid_grant',
      at: '2026-08-14T00:00:00Z',
    });

    expect(flagged.oauth?.lastError?.code).toBe('invalid_grant');
    expect(flagged.token?.lastError).toBeUndefined();
    // The credential itself is preserved: flagging is not deleting.
    expect(flagged.oauth?.refreshToken).toBe('refresh_1');
  });

  it('is a no-op when the block is absent', () => {
    const entry: Environment = { token: PAIR };

    expect(flagCredential(entry, 'oauth', { code: 'x', at: 'now' })).toEqual(
      entry,
    );
  });

  it('clears a previous error when passed null', () => {
    const flagged = flagCredential(
      { oauth: { ...OAUTH, lastError: { code: 'invalid_grant', at: 'now' } } },
      'oauth',
      null,
    );

    expect(flagged.oauth?.lastError).toBeUndefined();
  });
});

describe('summarizeEnvironment', () => {
  it('lists every credential an environment holds, preferred first', () => {
    const summary = summarizeEnvironment({ oauth: OAUTH, token: PAIR });

    expect(summary.kinds).toEqual(['oauth', 'token']);
    expect(summary.preferred).toBe('oauth');
  });

  it('reports the identity for display', () => {
    const summary = summarizeEnvironment({
      oauth: OAUTH,
      organizationName: 'Acme Inc',
      environmentName: 'Production',
      environmentId: 'env_123',
    });

    expect(summary.identity).toBe('Acme Inc / Production');
  });

  it('falls back to the organization alone when there is no environment name', () => {
    // Forward-looking: grants may eventually be scoped to an organization only.
    const summary = summarizeEnvironment({
      oauth: OAUTH,
      organizationName: 'Acme Inc',
    });

    expect(summary.identity).toBe('Acme Inc');
  });

  it('falls back to the environment id when no names are stored', () => {
    expect(
      summarizeEnvironment({ token: PAIR, environmentId: 'env_123' }).identity,
    ).toBe('env_123');
  });

  it('says nothing about expiry, which the CLI handles on its own', () => {
    // An expiring access token is refreshed automatically, so surfacing it only
    // invites the reader to act where there is nothing to do.
    const summary = summarizeEnvironment({
      oauth: { ...OAUTH, expiresAt: Math.floor(Date.now() / 1000) - 10 },
    });

    expect(JSON.stringify(summary)).not.toMatch(/expire/i);
  });

  it('surfaces a flagged failure ahead of expiry', () => {
    const summary = summarizeEnvironment({
      oauth: {
        ...OAUTH,
        expiresAt: Math.floor(Date.now() / 1000) + 1800,
        lastError: { code: 'invalid_grant', at: 'now' },
      },
    });

    expect(summary.warning).toMatch(/invalid_grant|sign in again/i);
  });

  it('has no warning for healthy credentials', () => {
    expect(summarizeEnvironment({ token: PAIR }).warning).toBeUndefined();
  });
});
