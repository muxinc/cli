import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  spyOn,
} from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getEnvironment,
  type OAuthCredentials,
  setCredential,
} from './config.ts';
import { OAuthError } from './oauth.ts';
import {
  ensureFreshAccessToken,
  isAccessTokenExpiring,
  REFRESH_SKEW_SECONDS,
  refreshEnvironmentTokens,
} from './token-refresh.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;
let originalXdgCacheHome: string | undefined;
let savedOAuthEnv: Record<string, string | undefined>;
let fetchSpy: Mock<typeof fetch> | undefined;

const OAUTH_ENV_KEYS = ['MUX_OAUTH_CLIENT_ID', 'MUX_OAUTH_TOKEN_URL'] as const;

const NAME = 'acme-production';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function credential(
  overrides: Partial<OAuthCredentials> = {},
): OAuthCredentials {
  return {
    accessToken: 'access_1',
    refreshToken: 'refresh_1',
    expiresAt: nowSeconds() + 3600,
    tokenType: 'Bearer',
    ...overrides,
  };
}

/**
 * Mock the token endpoint. Discovery requests 404 so endpoint resolution falls
 * back to the configured defaults, leaving `tokenCalls()` measuring exactly the
 * grant requests that refresh coalescing is about.
 */
function mockTokenEndpoint(body: unknown, status = 200) {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string,
  ) => {
    if (String(input).includes('/.well-known/')) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch);
  return fetchSpy;
}

/** How many token-endpoint requests were made (discovery excluded). */
function tokenCalls(): number {
  return (fetchSpy?.mock.calls ?? []).filter(
    (call) => !String(call[0]).includes('/.well-known/'),
  ).length;
}

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-refresh-test-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
  // Isolate the discovery cache too, or these tests would read and write the
  // real one in ~/.cache/mux and leak state between runs.
  originalXdgCacheHome = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = testConfigDir;

  savedOAuthEnv = {};
  for (const key of OAUTH_ENV_KEYS) {
    savedOAuthEnv[key] = process.env[key];
  }
  process.env.MUX_OAUTH_CLIENT_ID = 'test_client';
  process.env.MUX_OAUTH_TOKEN_URL = 'https://api.test/oauth/token';
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  if (originalXdgCacheHome === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = originalXdgCacheHome;
  }
  for (const key of OAUTH_ENV_KEYS) {
    if (savedOAuthEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedOAuthEnv[key];
    }
  }
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  await rm(testConfigDir, { recursive: true, force: true });
});

describe('isAccessTokenExpiring', () => {
  it('is false for a token valid well beyond the skew window', () => {
    expect(isAccessTokenExpiring(credential())).toBe(false);
  });

  it('is true inside the skew window, before actual expiry', () => {
    expect(
      isAccessTokenExpiring(
        credential({ expiresAt: nowSeconds() + REFRESH_SKEW_SECONDS - 10 }),
      ),
    ).toBe(true);
  });

  it('is true for an already expired token', () => {
    expect(
      isAccessTokenExpiring(credential({ expiresAt: nowSeconds() - 60 })),
    ).toBe(true);
  });

  it('is true when expiry is unknown', () => {
    expect(
      isAccessTokenExpiring(
        credential({ expiresAt: undefined as unknown as number }),
      ),
    ).toBe(true);
  });
});

describe('ensureFreshAccessToken', () => {
  it('returns the stored credential untouched when the token is fresh', async () => {
    const oauth = credential();
    await setCredential(NAME, 'oauth', oauth);
    const spy = mockTokenEndpoint({});

    expect((await ensureFreshAccessToken(NAME, oauth)).accessToken).toBe(
      'access_1',
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('refreshes and persists when the token is inside the skew window', async () => {
    const oauth = credential({ expiresAt: nowSeconds() + 30 });
    await setCredential(NAME, 'oauth', oauth);
    mockTokenEndpoint({
      access_token: 'access_2',
      refresh_token: 'refresh_2',
      expires_in: 3600,
    });

    const result = await ensureFreshAccessToken(NAME, oauth);

    expect(result.accessToken).toBe('access_2');
    expect(result.refreshToken).toBe('refresh_2');

    const stored = await getEnvironment(NAME);
    expect(stored?.oauth?.accessToken).toBe('access_2');
    expect(stored?.oauth?.refreshToken).toBe('refresh_2');
    expect(stored?.oauth?.expiresAt).toBeGreaterThan(nowSeconds() + 3000);
  });

  it('preserves environment-bound state and a token pair across a refresh', async () => {
    const oauth = credential({ expiresAt: nowSeconds() + 10 });
    await setCredential(
      NAME,
      'token',
      { tokenId: 'id_1', tokenSecret: 'secret_1' },
      {
        environmentId: 'env_123',
        organizationName: 'Acme Inc',
        signingKeyId: 'key_1',
        signingPrivateKey: 'private_1',
        forwardUrl: 'http://localhost:3000/webhooks',
        baseUrl: 'https://api.staging.test',
      },
    );
    await setCredential(NAME, 'oauth', oauth);
    mockTokenEndpoint({ access_token: 'access_2', expires_in: 3600 });

    await ensureFreshAccessToken(NAME, oauth);

    const stored = await getEnvironment(NAME);
    expect(stored?.signingKeyId).toBe('key_1');
    expect(stored?.signingPrivateKey).toBe('private_1');
    expect(stored?.forwardUrl).toBe('http://localhost:3000/webhooks');
    expect(stored?.baseUrl).toBe('https://api.staging.test');
    expect(stored?.environmentId).toBe('env_123');
    expect(stored?.organizationName).toBe('Acme Inc');
    // A refresh must not disturb the other way into this environment.
    expect(stored?.token).toEqual({ tokenId: 'id_1', tokenSecret: 'secret_1' });
  });

  it('performs a single refresh for concurrent callers', async () => {
    const oauth = credential({ expiresAt: nowSeconds() + 30 });
    await setCredential(NAME, 'oauth', oauth);
    mockTokenEndpoint({
      access_token: 'access_2',
      refresh_token: 'refresh_2',
      expires_in: 3600,
    });

    const results = await Promise.all([
      ensureFreshAccessToken(NAME, oauth),
      ensureFreshAccessToken(NAME, oauth),
      ensureFreshAccessToken(NAME, oauth),
    ]);

    // The lock holder refreshes; the others re-read the config and find the
    // fresh token, so the refresh token is never spent twice.
    expect(tokenCalls()).toBe(1);
    for (const result of results) {
      expect(result.accessToken).toBe('access_2');
    }
  });

  it('clears a previous failure flag after a successful refresh', async () => {
    const oauth = credential({
      expiresAt: nowSeconds() - 10,
      lastError: { code: 'invalid_grant', at: 'earlier' },
    });
    await setCredential(NAME, 'oauth', oauth);
    mockTokenEndpoint({ access_token: 'access_2', expires_in: 3600 });

    await ensureFreshAccessToken(NAME, oauth);

    expect((await getEnvironment(NAME))?.oauth?.lastError).toBeUndefined();
  });

  describe('terminal failure', () => {
    beforeEach(async () => {
      await setCredential(NAME, 'oauth', credential({ expiresAt: 1 }));
      mockTokenEndpoint({ error: 'invalid_grant' }, 400);
    });

    it('reports the environment name and the recovery step', async () => {
      const error = await ensureFreshAccessToken(
        NAME,
        credential({ expiresAt: 1 }),
      )
        .then(() => null)
        .catch((e: Error) => e);

      expect(error?.message).toContain(NAME);
      expect(error?.message).toContain('mux login');
    });

    it('flags the credential without deleting it', async () => {
      await ensureFreshAccessToken(NAME, credential({ expiresAt: 1 })).catch(
        () => undefined,
      );

      const stored = await getEnvironment(NAME);
      expect(stored?.oauth?.lastError?.code).toBe('invalid_grant');
      expect(stored?.oauth?.lastError?.at).toBeTruthy();
      // The credential stays put: removing it is the user's call.
      expect(stored?.oauth?.refreshToken).toBe('refresh_1');
    });

    it('leaves an access token pair on the same environment usable', async () => {
      await setCredential(NAME, 'token', {
        tokenId: 'id_1',
        tokenSecret: 'secret_1',
      });

      await ensureFreshAccessToken(NAME, credential({ expiresAt: 1 })).catch(
        () => undefined,
      );

      const stored = await getEnvironment(NAME);
      expect(stored?.token).toEqual({
        tokenId: 'id_1',
        tokenSecret: 'secret_1',
      });
      expect(stored?.token?.lastError).toBeUndefined();
    });
  });

  it('does not flag or suggest re-login when refresh fails for network reasons', async () => {
    const oauth = credential({ expiresAt: nowSeconds() - 10 });
    await setCredential(NAME, 'oauth', oauth);
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);

    const error = await ensureFreshAccessToken(NAME, oauth)
      .then(() => null)
      .catch((e: Error) => e);

    expect(error?.message).not.toContain('mux login');
    expect(error).toBeInstanceOf(OAuthError);
    expect((error as OAuthError).terminal).toBe(false);
    // A flaky connection is not evidence the credential is dead.
    expect((await getEnvironment(NAME))?.oauth?.lastError).toBeUndefined();
  });
});

describe('refreshEnvironmentTokens', () => {
  it('adopts a token another caller already refreshed instead of spending again', async () => {
    // The 401 came from `stale`, but the config already holds a replacement:
    // spending the refresh token again would rotate for nothing.
    await setCredential(
      NAME,
      'oauth',
      credential({ accessToken: 'access_new' }),
    );
    mockTokenEndpoint({ access_token: 'should_not_be_used', expires_in: 3600 });

    const result = await refreshEnvironmentTokens(
      NAME,
      credential({ accessToken: 'stale' }),
    );

    expect(result.accessToken).toBe('access_new');
    expect(tokenCalls()).toBe(0);
  });

  it('still refreshes when the stored token is the one that failed', async () => {
    await setCredential(NAME, 'oauth', credential({ accessToken: 'same' }));
    mockTokenEndpoint({ access_token: 'access_forced', expires_in: 3600 });

    const result = await refreshEnvironmentTokens(
      NAME,
      credential({ accessToken: 'same' }),
    );

    expect(result.accessToken).toBe('access_forced');
    expect(tokenCalls()).toBe(1);
  });

  it('refreshes when the stored replacement is itself expiring', async () => {
    await setCredential(
      NAME,
      'oauth',
      credential({ accessToken: 'access_new', expiresAt: 1 }),
    );
    mockTokenEndpoint({ access_token: 'access_forced', expires_in: 3600 });

    const result = await refreshEnvironmentTokens(
      NAME,
      credential({ accessToken: 'stale' }),
    );

    expect(result.accessToken).toBe('access_forced');
    expect(tokenCalls()).toBe(1);
  });

  it('refreshes regardless of expiry, for the post-401 retry path', async () => {
    const oauth = credential({ expiresAt: nowSeconds() + 3600 });
    await setCredential(NAME, 'oauth', oauth);
    mockTokenEndpoint({
      access_token: 'access_forced',
      expires_in: 3600,
    });

    const result = await refreshEnvironmentTokens(NAME, oauth);

    expect(tokenCalls()).toBe(1);
    expect(result.accessToken).toBe('access_forced');
    expect((await getEnvironment(NAME))?.oauth?.accessToken).toBe(
      'access_forced',
    );
  });
});
