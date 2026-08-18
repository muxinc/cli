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
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getOAuthEndpoints,
  getServerCapabilities,
  OAuthError,
  refreshAccessToken,
  resolveOAuthEndpoints,
  revokeRefreshToken,
} from './oauth.ts';

const ENV_KEYS = [
  'MUX_OAUTH_SCOPES',
  'MUX_OAUTH_CLIENT_ID',
  'MUX_OAUTH_AUTHORIZE_URL',
  'MUX_OAUTH_TOKEN_URL',
  'MUX_OAUTH_REVOKE_URL',
  'MUX_BASE_URL',
] as const;

let saved: Record<string, string | undefined>;
let fetchSpy: Mock<typeof fetch> | undefined;

function mockJsonResponse(body: unknown, status = 200) {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
  );
  return fetchSpy;
}

/** Parse the form-encoded body of the single recorded fetch call. */
function recordedBody(): URLSearchParams {
  const init = fetchSpy?.mock.calls[0]?.[1] as RequestInit;
  return new URLSearchParams(String(init.body));
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  process.env.MUX_OAUTH_CLIENT_ID = 'test_client';
  process.env.MUX_OAUTH_AUTHORIZE_URL = 'https://dash.test/oauth/authorize';
  process.env.MUX_OAUTH_TOKEN_URL = 'https://api.test/oauth/token';
  process.env.MUX_OAUTH_REVOKE_URL = 'https://api.test/oauth/revoke';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
});

describe('getOAuthEndpoints', () => {
  it('derives every endpoint from one API base', async () => {
    // A single MUX_BASE_URL moves the whole flow, so the token endpoint can
    // never end up on a different host than the authorization endpoint.
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.MUX_BASE_URL = 'https://api.staging.mux.com';

    const endpoints = getOAuthEndpoints();

    // Authorization is a UI-layer route; the grants are on the auth service.
    expect(endpoints.authorizationUrl).toBe(
      'https://api.staging.mux.com/ui/v1/oauth/authorize',
    );
    expect(endpoints.tokenUrl).toBe(
      'https://api.staging.mux.com/auth/v1/oauth/token',
    );
    expect(endpoints.revocationUrl).toBe(
      'https://api.staging.mux.com/auth/v1/oauth/revoke',
    );
  });

  it('does not double the slash on a base URL that ends in one', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.MUX_BASE_URL = 'https://api.staging.mux.com/';

    expect(getOAuthEndpoints().tokenUrl).toBe(
      'https://api.staging.mux.com/auth/v1/oauth/token',
    );
  });

  it('puts all three endpoints on the same host', () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const { authorizationUrl, tokenUrl, revocationUrl } = getOAuthEndpoints();
    const host = (u: string) => new URL(u).host;

    expect(host(tokenUrl)).toBe(host(authorizationUrl));
    expect(host(revocationUrl)).toBe(host(authorizationUrl));
  });

  it('reads overrides from the environment', () => {
    const endpoints = getOAuthEndpoints();

    expect(endpoints.clientId).toBe('test_client');
    expect(endpoints.authorizationUrl).toBe(
      'https://dash.test/oauth/authorize',
    );
    expect(endpoints.tokenUrl).toBe('https://api.test/oauth/token');
    expect(endpoints.revocationUrl).toBe('https://api.test/oauth/revoke');
  });

  it('falls back to built-in defaults when unset', () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const endpoints = getOAuthEndpoints();

    expect(endpoints.clientId).toBeTruthy();
    expect(endpoints.authorizationUrl).toStartWith('https://');
    expect(endpoints.tokenUrl).toStartWith('https://');
  });
});

describe('buildAuthorizationUrl', () => {
  it('includes the PKCE challenge, state, and redirect URI', () => {
    const url = new URL(
      buildAuthorizationUrl({
        codeChallenge: 'challenge-value',
        state: 'state-value',
        redirectUri: 'http://127.0.0.1:51372/callback',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://dash.test/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test_client');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:51372/callback',
    );
  });

  it('never sends the plain PKCE method', () => {
    const url = buildAuthorizationUrl({
      codeChallenge: 'c',
      state: 's',
      redirectUri: 'http://127.0.0.1:1/callback',
    });

    expect(url).not.toContain('plain');
  });

  it('never carries a client secret', () => {
    const url = buildAuthorizationUrl({
      codeChallenge: 'c',
      state: 's',
      redirectUri: 'http://127.0.0.1:1/callback',
    });

    expect(url).not.toContain('client_secret');
  });
});

describe('exchangeCodeForTokens', () => {
  // Endpoints passed explicitly: these cases assert the grant request, and
  // resolution (including discovery) is covered separately below.
  const params = {
    code: 'auth_code',
    codeVerifier: 'verifier_value',
    redirectUri: 'http://127.0.0.1:51372/callback',
    get endpoints() {
      return getOAuthEndpoints();
    },
  };

  it('posts the authorization code grant with the PKCE verifier', async () => {
    mockJsonResponse({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await exchangeCodeForTokens(params);

    const [url, init] = fetchSpy?.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/oauth/token');
    expect(init.method).toBe('POST');

    const body = recordedBody();
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth_code');
    expect(body.get('code_verifier')).toBe('verifier_value');
    expect(body.get('client_id')).toBe('test_client');
    expect(body.get('redirect_uri')).toBe('http://127.0.0.1:51372/callback');
    expect(body.get('client_secret')).toBeNull();
  });

  it('bounds the request so a half-open connection cannot hang a login', async () => {
    mockJsonResponse({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
    });

    await exchangeCodeForTokens(params);

    const init = fetchSpy?.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('converts expires_in into an absolute expiry', async () => {
    mockJsonResponse({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    const before = Math.floor(Date.now() / 1000);
    const tokens = await exchangeCodeForTokens(params);
    const after = Math.floor(Date.now() / 1000);

    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3600);
    expect(tokens.expiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it('preserves the granted scope when present', async () => {
    mockJsonResponse({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 60,
      scope: 'video:read video:write',
    });

    const tokens = await exchangeCodeForTokens(params);

    expect(tokens.scope).toBe('video:read video:write');
  });

  it('raises a terminal error carrying the provider error description', async () => {
    mockJsonResponse(
      { error: 'invalid_grant', error_description: 'Code already used' },
      400,
    );

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error).toBeInstanceOf(OAuthError);
    expect(error.terminal).toBe(true);
    expect(error.code).toBe('invalid_grant');
    expect(error.message).toContain('Code already used');
  });

  it('names the endpoint it called, so a wrong URL is obvious', async () => {
    // A 404 from a misconfigured endpoint is otherwise indistinguishable from a
    // rejected credential.
    mockJsonResponse({ error: { type: 'not_found', messages: ['nope'] } }, 404);

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.message).toContain('https://api.test/oauth/token');
  });

  it('renders the Mux API error envelope instead of [object Object]', async () => {
    // Endpoints that are not OAuth-aware (or a wrong token URL) answer with
    // Mux's envelope, where `error` is an object rather than RFC 6749's string.
    mockJsonResponse(
      {
        error: {
          type: 'not_found',
          messages: [
            "The requested resource either doesn't exist or you don't have access to it.",
          ],
        },
      },
      404,
    );

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.message).toContain("doesn't exist");
    expect(error.message).not.toContain('[object Object]');
    expect(error.code).toBe('not_found');
  });

  it('falls back to the envelope type when it carries no messages', async () => {
    mockJsonResponse({ error: { type: 'forbidden' } }, 403);

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.message).toContain('forbidden');
    expect(error.code).toBe('forbidden');
  });

  it('shows a snippet of an unrecognized body so the failure is diagnosable', async () => {
    // A proxy or CDN error page, or a path that is not the token endpoint.
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
          status: 502,
        })) as unknown as typeof fetch,
    );

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.message).toContain('502 Bad Gateway');
    expect(error.message).not.toContain('[object Object]');
  });

  it('includes the HTTP status when the provider sends no error body', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('gateway blew up', {
          status: 502,
        })) as unknown as typeof fetch,
    );

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error).toBeInstanceOf(OAuthError);
    expect(error.message).toContain('502');
  });

  it('treats a network failure as retryable', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);

    const error = (await exchangeCodeForTokens(params).catch(
      (e) => e,
    )) as OAuthError;

    expect(error).toBeInstanceOf(OAuthError);
    expect(error.terminal).toBe(false);
  });

  it('rejects a success response that omits an access token', async () => {
    mockJsonResponse({ refresh_token: 'rt', expires_in: 60 });

    expect(exchangeCodeForTokens(params)).rejects.toThrow(/access token/i);
  });
});

describe('refreshAccessToken', () => {
  it('posts the refresh_token grant', async () => {
    mockJsonResponse({
      access_token: 'at2',
      refresh_token: 'rt2',
      expires_in: 3600,
    });

    const tokens = await refreshAccessToken('rt1', getOAuthEndpoints());

    const body = recordedBody();
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt1');
    expect(body.get('client_id')).toBe('test_client');
    expect(tokens.accessToken).toBe('at2');
  });

  it('adopts a rotated refresh token', async () => {
    mockJsonResponse({
      access_token: 'at2',
      refresh_token: 'rotated',
      expires_in: 60,
    });

    expect(
      (await refreshAccessToken('rt1', getOAuthEndpoints())).refreshToken,
    ).toBe('rotated');
  });

  it('reuses the presented refresh token when the response omits one', async () => {
    mockJsonResponse({ access_token: 'at2', expires_in: 60 });

    expect(
      (await refreshAccessToken('rt1', getOAuthEndpoints())).refreshToken,
    ).toBe('rt1');
  });

  it('marks invalid_grant as terminal', async () => {
    mockJsonResponse({ error: 'invalid_grant' }, 400);

    const error = (await refreshAccessToken('rt1', getOAuthEndpoints()).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.terminal).toBe(true);
    expect(error.code).toBe('invalid_grant');
  });

  it('marks a server error as retryable', async () => {
    mockJsonResponse({ error: 'temporarily_unavailable' }, 503);

    const error = (await refreshAccessToken('rt1', getOAuthEndpoints()).catch(
      (e) => e,
    )) as OAuthError;

    expect(error.terminal).toBe(false);
  });
});

describe('revokeRefreshToken', () => {
  it('posts the token to the revocation endpoint', async () => {
    mockJsonResponse({}, 200);

    await revokeRefreshToken('rt1', getOAuthEndpoints());

    const [url] = fetchSpy?.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/oauth/revoke');
    expect(recordedBody().get('token')).toBe('rt1');
  });

  it('raises so callers can warn, without throwing on 200', async () => {
    mockJsonResponse({ error: 'server_error' }, 500);

    expect(revokeRefreshToken('rt1', getOAuthEndpoints())).rejects.toThrow();
  });
});

describe('resolveOAuthEndpoints', () => {
  let cacheDir: string;
  let originalCacheHome: string | undefined;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'mux-cli-oauth-endpoints-'));
    originalCacheHome = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheDir;
    // Discovery is keyed off the API base URL.
    process.env.MUX_BASE_URL = 'https://api.mux.com';
  });

  afterEach(async () => {
    if (originalCacheHome === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = originalCacheHome;
    }
    await rm(cacheDir, { recursive: true, force: true });
  });

  function mockDiscoveryDocument(document: unknown) {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: string,
    ) => {
      if (String(input).includes('/.well-known/')) {
        return new Response(JSON.stringify(document), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch);
    return fetchSpy;
  }

  it('prefers endpoints published by the authorization server', async () => {
    // Clear the overrides so discovery is what supplies the endpoints.
    delete process.env.MUX_OAUTH_AUTHORIZE_URL;
    delete process.env.MUX_OAUTH_TOKEN_URL;
    delete process.env.MUX_OAUTH_REVOKE_URL;
    mockDiscoveryDocument({
      authorization_endpoint: 'https://dashboard.mux.com/oauth/v2/authorize',
      token_endpoint: 'https://api.mux.com/oauth/v2/token',
      revocation_endpoint: 'https://api.mux.com/oauth/v2/revoke',
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
    });

    const endpoints = await resolveOAuthEndpoints();

    expect(endpoints.tokenUrl).toBe('https://api.mux.com/oauth/v2/token');
    expect(endpoints.authorizationUrl).toBe(
      'https://dashboard.mux.com/oauth/v2/authorize',
    );
    expect(getServerCapabilities().grantTypes).toContain('refresh_token');
  });

  it('lets an explicit environment override beat discovery', async () => {
    // Overrides are how staging is pinned; a discovery document must not win.
    process.env.MUX_OAUTH_TOKEN_URL = 'https://api.test/oauth/token';
    mockDiscoveryDocument({
      token_endpoint: 'https://api.mux.com/oauth/v2/token',
      authorization_endpoint: 'https://dashboard.mux.com/oauth/v2/authorize',
    });

    expect((await resolveOAuthEndpoints()).tokenUrl).toBe(
      'https://api.test/oauth/token',
    );
  });

  it('falls back to built-in defaults when discovery is unreachable', async () => {
    delete process.env.MUX_OAUTH_TOKEN_URL;
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);

    // Discovery must never be load-bearing: an outage cannot block login.
    const endpoints = await resolveOAuthEndpoints();

    expect(endpoints.tokenUrl).toStartWith('https://');
    expect(getServerCapabilities().grantTypes).toBeUndefined();
  });

  it('keeps defaults for fields the document omits', async () => {
    delete process.env.MUX_OAUTH_REVOKE_URL;
    delete process.env.MUX_OAUTH_TOKEN_URL;
    // OIDC documents have no revocation_endpoint.
    mockDiscoveryDocument({
      authorization_endpoint: 'https://dashboard.mux.com/oauth/v2/authorize',
      token_endpoint: 'https://api.mux.com/oauth/v2/token',
    });

    const endpoints = await resolveOAuthEndpoints();

    expect(endpoints.tokenUrl).toBe('https://api.mux.com/oauth/v2/token');
    // Asserted against the built-in default rather than a literal, so pointing
    // the defaults at another environment does not break this.
    expect(endpoints.revocationUrl).toBe(getOAuthEndpoints().revocationUrl);
  });

  it('does not widen its scopes to whatever the server advertises', async () => {
    // scopes_supported is everything the server offers. Adopting it would mean
    // silently requesting any scope Mux adds later, growing the consent screen
    // with no code change.
    delete process.env.MUX_OAUTH_SCOPES;
    mockDiscoveryDocument({
      authorization_endpoint: 'https://dashboard.mux.com/oauth/authorize',
      token_endpoint: 'https://api.mux.com/oauth/token',
      scopes_supported: ['video:read', 'billing:write', 'admin:everything'],
    });

    const { scopes } = await resolveOAuthEndpoints();

    expect(scopes).toEqual(getOAuthEndpoints().scopes);
    expect(scopes).not.toContain('billing:write');
    expect(scopes).not.toContain('admin:everything');
  });

  it('requests read and write across the API families the CLI covers', async () => {
    delete process.env.MUX_OAUTH_SCOPES;

    const { scopes } = getOAuthEndpoints();

    for (const family of ['video', 'data', 'robots', 'system']) {
      expect(scopes).toContain(`${family}:read`);
      expect(scopes).toContain(`${family}:write`);
    }
  });

  it('does not request OIDC scopes, since no id_token is consumed', async () => {
    delete process.env.MUX_OAUTH_SCOPES;

    const { scopes } = getOAuthEndpoints();

    expect(scopes).not.toContain('openid');
    expect(scopes).not.toContain('profile');
    expect(scopes).not.toContain('email');
  });

  it('lets MUX_OAUTH_SCOPES narrow the request', async () => {
    process.env.MUX_OAUTH_SCOPES = 'video:read';
    mockDiscoveryDocument({
      authorization_endpoint: 'https://dashboard.mux.com/oauth/authorize',
      token_endpoint: 'https://api.mux.com/oauth/token',
      scopes_supported: ['video:read', 'video:write', 'data:read'],
    });

    try {
      expect((await resolveOAuthEndpoints()).scopes).toEqual(['video:read']);
    } finally {
      delete process.env.MUX_OAUTH_SCOPES;
    }
  });

  it('ignores an endpoint pointing off-domain', async () => {
    delete process.env.MUX_OAUTH_TOKEN_URL;
    mockDiscoveryDocument({
      authorization_endpoint: 'https://dashboard.mux.com/oauth/v2/authorize',
      token_endpoint: 'https://evil.example.com/token',
    });

    // Falls back rather than sending an authorization code somewhere else.
    expect((await resolveOAuthEndpoints()).tokenUrl).toBe(
      getOAuthEndpoints().tokenUrl,
    );
  });
});
