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
  type Environment,
  getCurrentEnvironment,
  setEnvironment,
} from './config.ts';
import { setAgentMode, setJsonFlag } from './context.ts';
import {
  createAuthenticatedMuxClient,
  DEFAULT_BASE_URL,
  getAuthContext,
  getMuxBaseUrl,
  resetEnvCredentialNotice,
  resolveActiveEnvironment,
} from './mux.ts';

describe('getMuxBaseUrl', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalMuxBaseUrl: string | undefined;

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalMuxBaseUrl = process.env.MUX_BASE_URL;
    process.env.XDG_CONFIG_HOME = testConfigDir;
    delete process.env.MUX_BASE_URL;
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (originalMuxBaseUrl === undefined) {
      delete process.env.MUX_BASE_URL;
    } else {
      process.env.MUX_BASE_URL = originalMuxBaseUrl;
    }
    await rm(testConfigDir, { recursive: true, force: true });
  });

  it('should return default when no env var or config', async () => {
    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe(DEFAULT_BASE_URL);
  });

  it('should prefer MUX_BASE_URL env var over everything', async () => {
    process.env.MUX_BASE_URL = 'https://env-var.example.com';
    await setEnvironment('default', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
      baseUrl: 'https://config.example.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe('https://env-var.example.com');
  });

  it('should use config baseUrl when no env var is set', async () => {
    await setEnvironment('default', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
      baseUrl: 'https://config.example.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe('https://config.example.com');
  });

  it('should fall back to default when config has no baseUrl', async () => {
    await setEnvironment('default', {
      token: { tokenId: 'id', tokenSecret: 'secret' },
    });

    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe(DEFAULT_BASE_URL);
  });
});

describe('auth fallback to environment variables', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalTokenId: string | undefined;
  let originalTokenSecret: string | undefined;

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalTokenId = process.env.MUX_TOKEN_ID;
    originalTokenSecret = process.env.MUX_TOKEN_SECRET;
    process.env.XDG_CONFIG_HOME = testConfigDir;
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
    resetEnvCredentialNotice();
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (originalTokenId === undefined) {
      delete process.env.MUX_TOKEN_ID;
    } else {
      process.env.MUX_TOKEN_ID = originalTokenId;
    }
    if (originalTokenSecret === undefined) {
      delete process.env.MUX_TOKEN_SECRET;
    } else {
      process.env.MUX_TOKEN_SECRET = originalTokenSecret;
    }
    setAgentMode(false);
    setJsonFlag(false);
    await rm(testConfigDir, { recursive: true, force: true });
  });

  describe('getAuthContext', () => {
    it('uses MUX_TOKEN_ID/MUX_TOKEN_SECRET env vars when not logged in', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const { headers } = await getAuthContext();
      expect(headers.Authorization).toBe(
        `Basic ${btoa('env_token_id:env_token_secret')}`,
      );
    });

    it('prefers env vars over stored config (consistent with MUX_BASE_URL)', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const { headers } = await getAuthContext();
      expect(headers.Authorization).toBe(
        `Basic ${btoa('env_token_id:env_token_secret')}`,
      );
    });

    it('uses stored config when env vars are absent', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });

      const { headers } = await getAuthContext();
      expect(headers.Authorization).toBe(
        `Basic ${btoa('stored_id:stored_secret')}`,
      );
    });

    it('prints a one-time stderr notice when env vars shadow a stored login', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let notices: string[];

      try {
        await getAuthContext();
        await getAuthContext();
        notices = errorSpy.mock.calls
          .map((c) => String(c[0]))
          .filter((m) => m.includes('MUX_TOKEN_ID'));
      } finally {
        errorSpy.mockRestore();
      }

      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain('stored login');
    });

    it('suppresses the notice in agent mode', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      setAgentMode(true);
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let callCount: number;

      try {
        await getAuthContext();
        callCount = errorSpy.mock.calls.length;
      } finally {
        errorSpy.mockRestore();
      }

      expect(callCount).toBe(0);
    });

    it('suppresses the notice when --json was passed', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      setJsonFlag(true);
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let callCount: number;

      try {
        await getAuthContext();
        callCount = errorSpy.mock.calls.length;
      } finally {
        errorSpy.mockRestore();
      }

      expect(callCount).toBe(0);
    });

    it('prints no notice when there is no stored login to shadow', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let callCount: number;

      try {
        await getAuthContext();
        callCount = errorSpy.mock.calls.length;
      } finally {
        errorSpy.mockRestore();
      }

      expect(callCount).toBe(0);
    });

    it('does not inherit the stored config baseUrl when credentials come from env vars', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        baseUrl: 'https://stored.example.com',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const { baseUrl } = await getAuthContext();
      expect(baseUrl).toBe(DEFAULT_BASE_URL);
    });

    it('uses the stored config baseUrl when credentials come from config', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        baseUrl: 'https://stored.example.com',
      });

      const { baseUrl } = await getAuthContext();
      expect(baseUrl).toBe('https://stored.example.com');
    });

    it('ignores env vars when only one of the pair is set', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';

      expect(getAuthContext()).rejects.toThrow(/not logged in/i);
    });

    it('error message mentions both env vars and mux login', async () => {
      try {
        await getAuthContext();
        expect.unreachable('should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('MUX_TOKEN_ID');
        expect(message).toContain('MUX_TOKEN_SECRET');
        expect(message).toContain('mux login');
      }
    });
  });

  describe('createAuthenticatedMuxClient', () => {
    it('creates a client from env vars when not logged in', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const client = await createAuthenticatedMuxClient();
      expect(client.tokenId).toBe('env_token_id');
      expect(client.tokenSecret).toBe('env_token_secret');
    });

    it('throws the updated error when no credentials anywhere', async () => {
      expect(createAuthenticatedMuxClient()).rejects.toThrow(/MUX_TOKEN_ID/);
    });
  });

  describe('resolveActiveEnvironment', () => {
    let fetchSpy: Mock<typeof fetch>;

    function mockWhoami(environmentId: string | undefined, status = 200) {
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () =>
          new Response(
            JSON.stringify({ data: { environment_id: environmentId } }),
            { status },
          )) as unknown as typeof fetch,
      );
    }

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    it('uses the stored environment without calling the API when env vars are absent', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
      });
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
        throw new Error('unexpected fetch');
      }) as unknown as typeof fetch);

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('config');
      expect(active.environmentId).toBe('env_stored_123');
      expect(active.stored?.name).toBe('default');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to the environment name when stored config has no environmentId', async () => {
      await setEnvironment('legacy', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('config');
      expect(active.environmentId).toBe('legacy');
      expect(active.stored?.name).toBe('legacy');
    });

    it('resolves the environment id via whoami when only env vars are set', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_from_whoami');

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('env');
      expect(active.environmentId).toBe('env_from_whoami');
      expect(active.stored).toBeNull();
    });

    it('returns the stored environment when env var credentials match it', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_same_123',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_same_123');

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('env');
      expect(active.environmentId).toBe('env_same_123');
      expect(active.stored?.name).toBe('default');
    });

    it('matches env var credentials against non-default stored environments', async () => {
      await setEnvironment('production', {
        token: { tokenId: 'prod_id', tokenSecret: 'prod_secret' },
        environmentId: 'env_prod_123',
      });
      await setEnvironment('staging', {
        token: { tokenId: 'staging_id', tokenSecret: 'staging_secret' },
        environmentId: 'env_staging_456',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_staging_456');

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('env');
      expect(active.environmentId).toBe('env_staging_456');
      expect(active.stored?.name).toBe('staging');
    });

    it('prefers the current environment when multiple stored environments match', async () => {
      await setEnvironment('prod-copy', {
        token: { tokenId: 'a_id', tokenSecret: 'a_secret' },
        environmentId: 'env_same_123',
      });
      await setEnvironment('prod', {
        token: { tokenId: 'b_id', tokenSecret: 'b_secret' },
        environmentId: 'env_same_123',
      });
      // prod-copy was added first, so it is the default/current environment
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_same_123');

      const active = await resolveActiveEnvironment();

      expect(active.stored?.name).toBe('prod-copy');
    });

    it('drops the stored environment when env var credentials point elsewhere', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_other_456');

      const active = await resolveActiveEnvironment();

      expect(active.source).toBe('env');
      expect(active.environmentId).toBe('env_other_456');
      expect(active.stored).toBeNull();
    });

    it('drops the stored environment when it has no environmentId to compare', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_other_456');

      const active = await resolveActiveEnvironment();

      expect(active.stored).toBeNull();
    });

    it('prints the shadow notice when env vars redirect away from a stored login', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_other_456');
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let notices: string[];

      try {
        await resolveActiveEnvironment();
        notices = errorSpy.mock.calls
          .map((c) => String(c[0]))
          .filter((m) => m.includes('MUX_TOKEN_ID'));
      } finally {
        errorSpy.mockRestore();
      }

      expect(notices).toHaveLength(1);
    });

    it('prints no notice when only env credentials exist', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_from_whoami');
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      let callCount: number;

      try {
        await resolveActiveEnvironment();
        callCount = errorSpy.mock.calls.length;
      } finally {
        errorSpy.mockRestore();
      }

      expect(callCount).toBe(0);
    });

    it('resolves the base URL from the credential source, not the stored config', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
        baseUrl: 'https://stored.example.com',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_other_456');

      const active = await resolveActiveEnvironment();

      expect(active.baseUrl).toBe(DEFAULT_BASE_URL);
      const whoamiUrl = String(fetchSpy.mock.calls[0][0]);
      expect(whoamiUrl.startsWith(DEFAULT_BASE_URL)).toBe(true);
    });

    it('returns the stored baseUrl when credentials come from config', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
        baseUrl: 'https://stored.example.com',
      });

      const active = await resolveActiveEnvironment();

      expect(active.baseUrl).toBe('https://stored.example.com');
    });

    it('skips whoami when env credentials byte-match a stored environment', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'same_id', tokenSecret: 'same_secret' },
        environmentId: 'env_same_123',
      });
      process.env.MUX_TOKEN_ID = 'same_id';
      process.env.MUX_TOKEN_SECRET = 'same_secret';
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
        throw new Error('unexpected fetch');
      }) as unknown as typeof fetch);

      const active = await resolveActiveEnvironment();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(active.source).toBe('env');
      expect(active.environmentId).toBe('env_same_123');
      expect(active.stored?.name).toBe('default');
    });

    it('skips whoami when env credentials byte-match a non-default stored environment', async () => {
      await setEnvironment('production', {
        token: { tokenId: 'prod_id', tokenSecret: 'prod_secret' },
        environmentId: 'env_prod_123',
      });
      await setEnvironment('staging', {
        token: { tokenId: 'staging_id', tokenSecret: 'staging_secret' },
        environmentId: 'env_staging_456',
      });
      process.env.MUX_TOKEN_ID = 'staging_id';
      process.env.MUX_TOKEN_SECRET = 'staging_secret';
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
        throw new Error('unexpected fetch');
      }) as unknown as typeof fetch);

      const active = await resolveActiveEnvironment();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(active.environmentId).toBe('env_staging_456');
      expect(active.stored?.name).toBe('staging');
    });

    it('verifies a legacy byte-matching environment via whoami and still binds it', async () => {
      await setEnvironment('legacy', {
        token: { tokenId: 'same_id', tokenSecret: 'same_secret' },
      });
      process.env.MUX_TOKEN_ID = 'same_id';
      process.env.MUX_TOKEN_SECRET = 'same_secret';
      mockWhoami('env_from_whoami');

      const active = await resolveActiveEnvironment();

      expect(fetchSpy).toHaveBeenCalled();
      expect(active.environmentId).toBe('env_from_whoami');
      // Identical credentials mean the legacy entry IS this environment,
      // even though it has no environmentId to match by id.
      expect(active.stored?.name).toBe('legacy');
    });

    it('wraps whoami network failures in an actionable error', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch);

      expect(resolveActiveEnvironment()).rejects.toThrow(
        /failed to reach.*network/is,
      );
    });

    it('wraps non-JSON whoami responses in an actionable error', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () =>
          new Response('<html>proxy</html>', {
            status: 200,
          })) as unknown as typeof fetch,
      );

      expect(resolveActiveEnvironment()).rejects.toThrow(/non-JSON response/);
    });

    it('throws when whoami rejects the env var credentials', async () => {
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'bad_secret';
      mockWhoami(undefined, 401);

      expect(resolveActiveEnvironment()).rejects.toThrow(/credentials/i);
    });

    it('throws when no credentials are available anywhere', async () => {
      expect(resolveActiveEnvironment()).rejects.toThrow(/MUX_TOKEN_ID/);
    });
  });
});

describe('OAuth credentials', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let savedEnv: Record<string, string | undefined>;
  let fetchSpy: Mock<typeof fetch> | undefined;

  const TOUCHED_ENV = [
    'MUX_TOKEN_ID',
    'MUX_TOKEN_SECRET',
    'MUX_BASE_URL',
    'MUX_AUTHORIZATION_TOKEN',
    'MUX_OAUTH_CLIENT_ID',
    'MUX_OAUTH_TOKEN_URL',
  ] as const;

  function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  /** Store an OAuth login; overrides apply to the entry, not just the token. */
  async function storeOAuthEnvironment(overrides: Partial<Environment> = {}) {
    const { oauth, ...environmentFields } = overrides;
    await setEnvironment('acme-production', {
      oauth: {
        accessToken: 'access_1',
        refreshToken: 'refresh_1',
        expiresAt: nowSeconds() + 3600,
        tokenType: 'Bearer',
        ...oauth,
      },
      environmentId: 'env_123',
      environmentName: 'Production',
      organizationId: 'org_123',
      organizationName: 'Acme Inc',
      ...environmentFields,
    });
  }

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-oauth-mux-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = testConfigDir;

    savedEnv = {};
    for (const key of TOUCHED_ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.MUX_OAUTH_CLIENT_ID = 'test_client';
    process.env.MUX_OAUTH_TOKEN_URL = 'https://api.test/oauth/token';
    // Keep discovery's cache out of the real ~/.cache/mux.
    process.env.XDG_CACHE_HOME = testConfigDir;

    resetEnvCredentialNotice();
    setAgentMode(false);
    setJsonFlag(false);
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    for (const key of TOUCHED_ENV) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    resetEnvCredentialNotice();
    setAgentMode(false);
    setJsonFlag(false);
    await rm(testConfigDir, { recursive: true, force: true });
  });

  describe('getAuthContext', () => {
    it('sends the access token as a bearer credential', async () => {
      await storeOAuthEnvironment();

      const { headers } = await getAuthContext();

      expect(headers.Authorization).toBe('Bearer access_1');
    });

    it('still sends Basic auth for access token environments', async () => {
      await setEnvironment('ci-token', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });

      const { headers } = await getAuthContext();

      expect(headers.Authorization).toBe(
        `Basic ${btoa('stored_id:stored_secret')}`,
      );
    });

    it('uses the stored base URL of an OAuth environment', async () => {
      await storeOAuthEnvironment({ baseUrl: 'https://api.staging.test' });

      expect((await getAuthContext()).baseUrl).toBe('https://api.staging.test');
    });

    it('lets MUX_TOKEN_ID/MUX_TOKEN_SECRET shadow an OAuth login', async () => {
      await storeOAuthEnvironment();
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const { headers } = await getAuthContext();

      expect(headers.Authorization).toBe(
        `Basic ${btoa('env_token_id:env_token_secret')}`,
      );
    });

    it('names the shadowed OAuth login once on stderr', async () => {
      await storeOAuthEnvironment();
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

      try {
        await getAuthContext();
        await getAuthContext();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const message = String(errorSpy.mock.calls[0]?.[0]);
        expect(message).toContain('acme-production');
        expect(message).toContain('mux auth status');
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('suppresses the shadowing notice in agent mode', async () => {
      await storeOAuthEnvironment();
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      setAgentMode(true);
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

      try {
        await getAuthContext();

        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('refreshes an expiring access token before issuing the request', async () => {
      await storeOAuthEnvironment({
        oauth: { expiresAt: nowSeconds() + 30 } as never,
      });
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
        input: string,
      ) => {
        // Discovery 404s, so endpoint resolution falls back to the configured
        // defaults and the only other request is the refresh grant itself.
        if (String(input).includes('/.well-known/')) {
          return new Response('not found', { status: 404 });
        }
        return new Response(
          JSON.stringify({
            access_token: 'access_2',
            refresh_token: 'refresh_2',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch);

      const { headers } = await getAuthContext();

      expect(headers.Authorization).toBe('Bearer access_2');
      const grantCalls = (fetchSpy?.mock.calls ?? []).filter(
        (call) => !String(call[0]).includes('/.well-known/'),
      );
      expect(grantCalls).toHaveLength(1);
    });

    it('does not refresh a token that is still fresh', async () => {
      await storeOAuthEnvironment({
        oauth: { expiresAt: nowSeconds() + 3600 } as never,
      });
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () =>
          new Response('{}', { status: 200 })) as unknown as typeof fetch,
      );

      await getAuthContext();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('createAuthenticatedMuxClient', () => {
    it('passes the access token as the SDK authorization token', async () => {
      await storeOAuthEnvironment();

      const client = await createAuthenticatedMuxClient();

      expect(client.authorizationToken).toBe('access_1');
      expect(client.tokenId).toBeNull();
      expect(client.tokenSecret).toBeNull();
    });

    it('never passes both credential kinds to one client', async () => {
      await setEnvironment('ci-token', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });

      const client = await createAuthenticatedMuxClient();

      expect(client.tokenId).toBe('stored_id');
      expect(client.tokenSecret).toBe('stored_secret');
      // Left unset, the SDK would fall back to MUX_AUTHORIZATION_TOKEN and its
      // bearer header would override the Basic credentials above.
      expect(client.authorizationToken).toBeNull();
    });

    it('ignores an ambient MUX_AUTHORIZATION_TOKEN for a token pair login', async () => {
      process.env.MUX_AUTHORIZATION_TOKEN = 'ambient_bearer';
      await setEnvironment('ci-token', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      });

      const client = await createAuthenticatedMuxClient();

      expect(client.authorizationToken).toBeNull();
      expect((await getAuthContext()).headers.Authorization).toBe(
        `Basic ${btoa('stored_id:stored_secret')}`,
      );
    });
  });

  describe('resolveActiveEnvironment', () => {
    it('resolves an OAuth environment without any network call', async () => {
      await storeOAuthEnvironment();
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
        throw new Error('network should not be reached');
      }) as unknown as typeof fetch);

      const active = await resolveActiveEnvironment();

      expect(active.environmentId).toBe('env_123');
      expect(active.source).toBe('config');
      expect(active.kind).toBe('oauth');
      expect(active.stored?.name).toBe('acme-production');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports the token kind for access token environments', async () => {
      await setEnvironment('ci-token', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_456',
      });

      const active = await resolveActiveEnvironment();

      expect(active.kind).toBe('token');
      expect(active.environmentId).toBe('env_456');
    });
  });
});
