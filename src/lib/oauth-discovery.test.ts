import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  spyOn,
} from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearDiscoveryCache,
  DISCOVERY_CACHE_TTL_MS,
  discoverEndpoints,
  getDiscoveryCachePath,
  getDiscoveryUrls,
  validateEndpoint,
} from './oauth-discovery.ts';

let testCacheDir: string;
let originalXdgCacheHome: string | undefined;
let fetchSpy: Mock<typeof fetch> | undefined;

const OAUTH_DOC = {
  issuer: 'https://api.mux.com',
  authorization_endpoint: 'https://dashboard.mux.com/oauth/authorize',
  token_endpoint: 'https://api.mux.com/oauth/token',
  revocation_endpoint: 'https://api.mux.com/oauth/revoke',
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['video:read', 'video:write'],
};

/** Serve the given body for the first discovery path, 404 for the rest. */
function mockDiscovery(
  bodyByPath: Record<string, unknown>,
  status = 200,
): Mock<typeof fetch> {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string,
  ) => {
    const url = new URL(String(input));
    const body = bodyByPath[url.pathname];
    if (!body) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch);
  return fetchSpy;
}

beforeEach(async () => {
  testCacheDir = await mkdtemp(join(tmpdir(), 'mux-cli-discovery-'));
  originalXdgCacheHome = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = testCacheDir;
});

afterEach(async () => {
  if (originalXdgCacheHome === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = originalXdgCacheHome;
  }
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  await rm(testCacheDir, { recursive: true, force: true });
});

describe('getDiscoveryUrls', () => {
  it('derives both well-known paths from the API base URL', () => {
    const urls = getDiscoveryUrls('https://api.mux.com');

    expect(urls).toEqual([
      'https://api.mux.com/.well-known/oauth-authorization-server',
      'https://api.mux.com/.well-known/openid-configuration',
    ]);
  });

  it('tries the OAuth document before the OIDC one', () => {
    // RFC 8414 defines revocation_endpoint; OIDC Core does not.
    expect(getDiscoveryUrls('https://api.mux.com')[0]).toContain(
      'oauth-authorization-server',
    );
  });

  it('does not double up slashes on a base URL with a trailing slash', () => {
    expect(getDiscoveryUrls('https://api.mux.com/')[0]).toBe(
      'https://api.mux.com/.well-known/oauth-authorization-server',
    );
  });
});

describe('validateEndpoint', () => {
  const from = 'https://api.mux.com/.well-known/oauth-authorization-server';

  it('accepts https endpoints on mux.com', () => {
    expect(
      validateEndpoint('https://dashboard.mux.com/oauth/authorize', from),
    ).toBe('https://dashboard.mux.com/oauth/authorize');
  });

  it('accepts mux.com itself', () => {
    expect(
      validateEndpoint('https://mux.com/oauth/authorize', from),
    ).toBeTruthy();
  });

  it('rejects a foreign host', () => {
    // A document that could repoint the token endpoint elsewhere would turn the
    // authorization code and refresh token into an exfiltration.
    expect(validateEndpoint('https://evil.example.com/token', from)).toBeNull();
  });

  it('rejects a host that merely ends with the brand', () => {
    expect(validateEndpoint('https://notmux.com/token', from)).toBeNull();
    expect(
      validateEndpoint('https://mux.com.evil.test/token', from),
    ).toBeNull();
  });

  it('rejects plaintext http on a remote host', () => {
    expect(validateEndpoint('http://api.mux.com/oauth/token', from)).toBeNull();
  });

  it('rejects a non-URL', () => {
    expect(validateEndpoint('not a url', from)).toBeNull();
    expect(validateEndpoint('', from)).toBeNull();
  });

  it('accepts an endpoint sharing the origin of the discovery document', () => {
    // Lets a local or staging server be driven entirely by MUX_BASE_URL: the
    // document is only as trustworthy as the host it came from anyway.
    expect(
      validateEndpoint(
        'http://127.0.0.1:8410/oauth/token',
        'http://127.0.0.1:8410/.well-known/oauth-authorization-server',
      ),
    ).toBe('http://127.0.0.1:8410/oauth/token');
  });

  it('rejects a different loopback port than the document came from', () => {
    expect(
      validateEndpoint(
        'http://127.0.0.1:9999/oauth/token',
        'http://127.0.0.1:8410/.well-known/oauth-authorization-server',
      ),
    ).toBeNull();
  });
});

describe('discoverEndpoints', () => {
  it('returns the endpoints from the OAuth document', async () => {
    mockDiscovery({
      '/.well-known/oauth-authorization-server': OAUTH_DOC,
    });

    const result = await discoverEndpoints('https://api.mux.com');

    expect(result?.authorizationUrl).toBe(
      'https://dashboard.mux.com/oauth/authorize',
    );
    expect(result?.tokenUrl).toBe('https://api.mux.com/oauth/token');
    expect(result?.revocationUrl).toBe('https://api.mux.com/oauth/revoke');
    expect(result?.grantTypes).toContain('refresh_token');
    expect(result?.codeChallengeMethods).toContain('S256');
    expect(result?.scopes).toContain('video:read');
  });

  it('falls back to the OIDC document when the OAuth one is absent', async () => {
    const spy = mockDiscovery({
      '/.well-known/openid-configuration': {
        authorization_endpoint: 'https://dashboard.mux.com/oauth/authorize',
        token_endpoint: 'https://api.mux.com/oauth/token',
      },
    });

    const result = await discoverEndpoints('https://api.mux.com');

    expect(result?.tokenUrl).toBe('https://api.mux.com/oauth/token');
    // Both paths attempted, in order.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('omits an endpoint the document does not define', async () => {
    // OIDC Core has no revocation_endpoint; callers fall back per field.
    mockDiscovery({
      '/.well-known/openid-configuration': {
        authorization_endpoint: 'https://dashboard.mux.com/oauth/authorize',
        token_endpoint: 'https://api.mux.com/oauth/token',
      },
    });

    const result = await discoverEndpoints('https://api.mux.com');

    expect(result?.revocationUrl).toBeUndefined();
  });

  it('drops an endpoint that fails validation, keeping the rest', async () => {
    mockDiscovery({
      '/.well-known/oauth-authorization-server': {
        ...OAUTH_DOC,
        token_endpoint: 'https://evil.example.com/token',
      },
    });

    const result = await discoverEndpoints('https://api.mux.com');

    expect(result?.tokenUrl).toBeUndefined();
    expect(result?.authorizationUrl).toBe(
      'https://dashboard.mux.com/oauth/authorize',
    );
  });

  it('returns null when no document is reachable', async () => {
    mockDiscovery({});

    expect(await discoverEndpoints('https://api.mux.com')).toBeNull();
  });

  it('returns null rather than throwing when the network fails', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);

    // Discovery is an upgrade path, never a hard dependency: callers fall back
    // to their built-in defaults.
    expect(await discoverEndpoints('https://api.mux.com')).toBeNull();
  });

  it('returns null on a malformed document', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('<html>nope</html>', {
          status: 200,
        })) as unknown as typeof fetch,
    );

    expect(await discoverEndpoints('https://api.mux.com')).toBeNull();
  });

  it('returns null on a document with no usable endpoints', async () => {
    mockDiscovery({
      '/.well-known/oauth-authorization-server': {
        issuer: 'https://api.mux.com',
      },
    });

    expect(await discoverEndpoints('https://api.mux.com')).toBeNull();
  });

  describe('caching', () => {
    it('writes the result to the cache', async () => {
      mockDiscovery({ '/.well-known/oauth-authorization-server': OAUTH_DOC });

      await discoverEndpoints('https://api.mux.com');

      expect(existsSync(getDiscoveryCachePath())).toBe(true);
    });

    it('serves a second call from the cache without fetching', async () => {
      const spy = mockDiscovery({
        '/.well-known/oauth-authorization-server': OAUTH_DOC,
      });
      await discoverEndpoints('https://api.mux.com');
      const callsAfterFirst = spy.mock.calls.length;

      const result = await discoverEndpoints('https://api.mux.com');

      expect(spy.mock.calls.length).toBe(callsAfterFirst);
      expect(result?.tokenUrl).toBe('https://api.mux.com/oauth/token');
    });

    it('refetches once the cache is older than the TTL', async () => {
      const spy = mockDiscovery({
        '/.well-known/oauth-authorization-server': OAUTH_DOC,
      });
      await discoverEndpoints('https://api.mux.com');
      const callsAfterFirst = spy.mock.calls.length;

      // Backdate the cache past its TTL.
      const cached = JSON.parse(await Bun.file(getDiscoveryCachePath()).text());
      cached.fetchedAt = Date.now() - DISCOVERY_CACHE_TTL_MS - 1000;
      await Bun.write(getDiscoveryCachePath(), JSON.stringify(cached));

      await discoverEndpoints('https://api.mux.com');

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('keys the cache by base URL, so one host does not serve another', async () => {
      mockDiscovery({ '/.well-known/oauth-authorization-server': OAUTH_DOC });
      await discoverEndpoints('https://api.mux.com');

      const spy = mockDiscovery({
        '/.well-known/oauth-authorization-server': {
          ...OAUTH_DOC,
          token_endpoint: 'https://api.example.com/oauth/token',
        },
      });
      const result = await discoverEndpoints('https://api.example.com');

      expect(spy.mock.calls.length).toBeGreaterThan(0);
      expect(result?.tokenUrl).toBe('https://api.example.com/oauth/token');
    });

    it('ignores an unreadable cache and refetches', async () => {
      await Bun.write(getDiscoveryCachePath(), 'not json');
      const spy = mockDiscovery({
        '/.well-known/oauth-authorization-server': OAUTH_DOC,
      });

      const result = await discoverEndpoints('https://api.mux.com');

      expect(spy.mock.calls.length).toBeGreaterThan(0);
      expect(result?.tokenUrl).toBe('https://api.mux.com/oauth/token');
    });

    it('clearDiscoveryCache forces the next call to refetch', async () => {
      const spy = mockDiscovery({
        '/.well-known/oauth-authorization-server': OAUTH_DOC,
      });
      await discoverEndpoints('https://api.mux.com');
      const callsAfterFirst = spy.mock.calls.length;

      await clearDiscoveryCache();
      await discoverEndpoints('https://api.mux.com');

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });
});
