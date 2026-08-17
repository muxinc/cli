import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Environment,
  getCurrentEnvironment,
  getEnvironment,
  getEnvironmentAuthType,
  setEnvironment,
} from './config.ts';
import type { OAuthTokens } from './oauth.ts';
import {
  deriveEnvironmentName,
  type OAuthLoginDeps,
  performOAuthLogin,
} from './oauth-login.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-oauth-login-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  await rm(testConfigDir, { recursive: true, force: true });
});

const TOKENS: OAuthTokens = {
  accessToken: 'access_1',
  refreshToken: 'refresh_1',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  tokenType: 'Bearer',
};

/**
 * A login where every external step is stubbed: a fake loopback server, a fake
 * browser, a fixed token exchange, and a fixed identity.
 */
function fakeDeps(overrides: Partial<OAuthLoginDeps> = {}): OAuthLoginDeps {
  return {
    startServer: async () => ({
      port: 51372,
      redirectUri: 'http://127.0.0.1:51372/callback',
      waitForCode: async () => 'auth_code',
      stop: () => {},
    }),
    openBrowser: async () => true,
    endpoints: {
      clientId: 'test_client',
      authorizationUrl: 'https://dash.test/oauth/authorize',
      tokenUrl: 'https://api.test/oauth/token',
      revocationUrl: 'https://api.test/oauth/revoke',
      scopes: [],
    },
    exchange: async () => TOKENS,
    validate: async () => ({
      valid: true as const,
      identity: {
        environmentId: 'env_123',
        environmentName: 'Production',
        organizationId: 'org_123',
        organizationName: 'Acme Inc',
        permissions: ['video'],
      },
    }),
    ...overrides,
  };
}

describe('deriveEnvironmentName', () => {
  it('slugifies the organization and environment names', () => {
    expect(
      deriveEnvironmentName({
        organizationName: 'Acme Inc',
        environmentName: 'Production',
        taken: [],
      }),
    ).toBe('acme-inc-production');
  });

  it('collapses punctuation and repeated separators', () => {
    expect(
      deriveEnvironmentName({
        organizationName: 'Foo, Bar & Baz!',
        environmentName: 'Staging // EU',
        taken: [],
      }),
    ).toBe('foo-bar-baz-staging-eu');
  });

  it('suffixes on collision rather than overwriting another environment', () => {
    expect(
      deriveEnvironmentName({
        organizationName: 'Acme Inc',
        environmentName: 'Production',
        taken: ['acme-inc-production'],
      }),
    ).toBe('acme-inc-production-2');
  });

  it('keeps counting past the first collision', () => {
    expect(
      deriveEnvironmentName({
        organizationName: 'Acme Inc',
        environmentName: 'Production',
        taken: ['acme-inc-production', 'acme-inc-production-2'],
      }),
    ).toBe('acme-inc-production-3');
  });

  it('falls back to the environment id when names are missing', () => {
    expect(deriveEnvironmentName({ environmentId: 'env_abc', taken: [] })).toBe(
      'env_abc',
    );
  });

  it('falls back to a generic name when nothing identifies the environment', () => {
    expect(deriveEnvironmentName({ taken: [] })).toBe('default');
  });
});

describe('performOAuthLogin', () => {
  it('stores the login under a derived name and returns a summary', async () => {
    const result = await performOAuthLogin({}, fakeDeps());

    expect(result.name).toBe('acme-inc-production');
    expect(result.identity.environmentId).toBe('env_123');

    const stored = (await getEnvironment('acme-inc-production')) as Environment;
    expect(stored.oauth?.accessToken).toBe('access_1');
    expect(stored.oauth?.refreshToken).toBe('refresh_1');
    expect(stored.environmentId).toBe('env_123');
    expect(stored.organizationName).toBe('Acme Inc');
    expect(stored.environmentName).toBe('Production');
  });

  it('sends a PKCE S256 challenge and the loopback redirect URI', async () => {
    let authorizationUrl = '';
    let exchanged: { codeVerifier: string; redirectUri: string } | undefined;

    await performOAuthLogin(
      {},
      fakeDeps({
        openBrowser: async (url: string) => {
          authorizationUrl = url;
          return true;
        },
        exchange: async (params) => {
          exchanged = params;
          return TOKENS;
        },
      }),
    );

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:51372/callback',
    );
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    // The verifier is what proves the exchange belongs to this attempt, and it
    // must never appear on the authorization request.
    expect(authorizationUrl).not.toContain(exchanged?.codeVerifier ?? 'absent');
    expect(exchanged?.redirectUri).toBe('http://127.0.0.1:51372/callback');
  });

  it('honors an explicit environment name', async () => {
    const result = await performOAuthLogin({ name: 'my-env' }, fakeDeps());

    expect(result.name).toBe('my-env');
    expect(await getEnvironment('my-env')).not.toBeNull();
  });

  it('activates the new login by default', async () => {
    await performOAuthLogin({}, fakeDeps());

    expect((await getCurrentEnvironment())?.name).toBe('acme-inc-production');
  });

  it('leaves the active selection alone when activation is declined', async () => {
    await setEnvironment('existing', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
    });

    await performOAuthLogin({ activate: false }, fakeDeps());

    expect((await getCurrentEnvironment())?.name).toBe('existing');
    expect(await getEnvironment('acme-inc-production')).not.toBeNull();
  });

  it('replaces tokens in place when logging in to an already stored environment', async () => {
    await setEnvironment('previous-name', {
      oauth: {
        accessToken: 'old_access',
        refreshToken: 'old_refresh',
        expiresAt: 1,
      },
      environmentId: 'env_123',
      signingKeyId: 'key_1',
      signingPrivateKey: 'private_1',
      forwardUrl: 'http://localhost:3000/webhooks',
    });

    const result = await performOAuthLogin({}, fakeDeps());

    // Matched by environment id, not by name: the existing entry is updated
    // rather than a duplicate being created.
    expect(result.name).toBe('previous-name');
    const stored = (await getEnvironment('previous-name')) as Environment;
    expect(stored.oauth?.accessToken).toBe('access_1');
    expect(stored.signingKeyId).toBe('key_1');
    expect(stored.signingPrivateKey).toBe('private_1');
    expect(stored.forwardUrl).toBe('http://localhost:3000/webhooks');
    expect(await getEnvironment('acme-inc-production')).toBeNull();
  });

  it('adds an entry when logging in to a different environment', async () => {
    await setEnvironment('acme-inc-staging', {
      oauth: {
        accessToken: 'staging_access',
        refreshToken: 'staging_refresh',
        expiresAt: 1,
      },
      environmentId: 'env_staging',
    });

    await performOAuthLogin({}, fakeDeps());

    // Re-login must never clobber a different environment's credentials.
    const staging = (await getEnvironment('acme-inc-staging')) as Environment;
    expect(staging.oauth?.accessToken).toBe('staging_access');
    expect(await getEnvironment('acme-inc-production')).not.toBeNull();
  });

  it('keeps an existing access token pair alongside the new OAuth login', async () => {
    await setEnvironment('ci-token', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
      environmentId: 'env_123',
      forwardUrl: 'http://localhost:3000/webhooks',
    });

    const result = await performOAuthLogin({}, fakeDeps());

    expect(result.name).toBe('ci-token');
    const stored = (await getEnvironment('ci-token')) as Environment;
    expect(stored.oauth?.accessToken).toBe('access_1');
    expect(stored.forwardUrl).toBe('http://localhost:3000/webhooks');
    // One environment, two ways in: signing in with OAuth must not throw away
    // a token pair that CI or a script may depend on.
    expect(stored.token).toEqual({ tokenId: 'id', tokenSecret: 'secret' });
    expect(getEnvironmentAuthType(stored)).toBe('oauth');
  });

  it('carries a token pair across when --name moves the entry', async () => {
    await setEnvironment('old-name', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
      environmentId: 'env_123',
      signingKeyId: 'key_1',
    });

    await performOAuthLogin({ name: 'new-name' }, fakeDeps());

    const stored = (await getEnvironment('new-name')) as Environment;
    expect(stored.token).toEqual({ tokenId: 'id', tokenSecret: 'secret' });
    expect(stored.signingKeyId).toBe('key_1');
    expect(await getEnvironment('old-name')).toBeNull();
  });

  it('reports the authorization URL when no browser could be opened', async () => {
    let reported: { url: string; opened: boolean } | undefined;

    await performOAuthLogin(
      { noBrowser: true },
      fakeDeps({
        openBrowser: async () => false,
        onAuthorizationUrl: (url, opened) => {
          reported = { url, opened };
        },
      }),
    );

    expect(reported?.opened).toBe(false);
    expect(reported?.url).toContain('code_challenge');
  });

  it('does not open a browser when asked not to', async () => {
    let opened = false;

    await performOAuthLogin(
      { noBrowser: true },
      fakeDeps({
        openBrowser: async () => {
          opened = true;
          return true;
        },
      }),
    );

    expect(opened).toBe(false);
  });

  it('stores nothing when the token could not be verified', async () => {
    const failing = fakeDeps({
      validate: async () => ({
        valid: false as const,
        error: 'Could not verify the access token: 401 Unauthorized.',
      }),
    });

    await expect(performOAuthLogin({}, failing)).rejects.toThrow(
      /could not verify/i,
    );

    expect(await getCurrentEnvironment()).toBeNull();
  });

  it('stores nothing when the redirect never arrives', async () => {
    const failing = fakeDeps({
      startServer: async () => ({
        port: 51372,
        redirectUri: 'http://127.0.0.1:51372/callback',
        waitForCode: async () => {
          throw new Error('Login timed out after 300s');
        },
        stop: () => {},
      }),
    });

    await expect(performOAuthLogin({}, failing)).rejects.toThrow(/timed out/);

    expect(await getCurrentEnvironment()).toBeNull();
  });

  it('closes the loopback server whether the login succeeds or fails', async () => {
    let stopped = 0;
    const server = {
      port: 51372,
      redirectUri: 'http://127.0.0.1:51372/callback',
      waitForCode: async () => 'auth_code',
      stop: () => {
        stopped += 1;
      },
    };

    await performOAuthLogin({}, fakeDeps({ startServer: async () => server }));
    expect(stopped).toBeGreaterThan(0);

    const before = stopped;
    await performOAuthLogin(
      {},
      fakeDeps({
        startServer: async () => server,
        exchange: async () => {
          throw new Error('exchange failed');
        },
      }),
    ).catch(() => undefined);

    expect(stopped).toBeGreaterThan(before);
  });

  it('passes an explicit port through to the loopback server', async () => {
    let requestedPort: number | undefined;

    await performOAuthLogin(
      { port: 9999 },
      fakeDeps({
        startServer: async (options) => {
          requestedPort = options.port;
          return {
            port: options.port ?? 51372,
            redirectUri: `http://127.0.0.1:${options.port}/callback`,
            waitForCode: async () => 'auth_code',
            stop: () => {},
          };
        },
      }),
    );

    expect(requestedPort).toBe(9999);
  });
});
