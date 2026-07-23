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
import { getCurrentEnvironment, setEnvironment } from './config.ts';
import { setAgentMode } from './context.ts';
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
      tokenId: 'id',
      tokenSecret: 'secret',
      baseUrl: 'https://config.example.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe('https://env-var.example.com');
  });

  it('should use config baseUrl when no env var is set', async () => {
    await setEnvironment('default', {
      tokenId: 'id',
      tokenSecret: 'secret',
      baseUrl: 'https://config.example.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxBaseUrl(env)).toBe('https://config.example.com');
  });

  it('should fall back to default when config has no baseUrl', async () => {
    await setEnvironment('default', {
      tokenId: 'id',
      tokenSecret: 'secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
      });

      const { headers } = await getAuthContext();
      expect(headers.Authorization).toBe(
        `Basic ${btoa('stored_id:stored_secret')}`,
      );
    });

    it('prints a one-time stderr notice when env vars shadow a stored login', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        baseUrl: 'https://stored.example.com',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';

      const { baseUrl } = await getAuthContext();
      expect(baseUrl).toBe(DEFAULT_BASE_URL);
    });

    it('uses the stored config baseUrl when credentials come from config', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'prod_id',
        tokenSecret: 'prod_secret',
        environmentId: 'env_prod_123',
      });
      await setEnvironment('staging', {
        tokenId: 'staging_id',
        tokenSecret: 'staging_secret',
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
        tokenId: 'a_id',
        tokenSecret: 'a_secret',
        environmentId: 'env_same_123',
      });
      await setEnvironment('prod', {
        tokenId: 'b_id',
        tokenSecret: 'b_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
      });
      process.env.MUX_TOKEN_ID = 'env_token_id';
      process.env.MUX_TOKEN_SECRET = 'env_token_secret';
      mockWhoami('env_other_456');

      const active = await resolveActiveEnvironment();

      expect(active.stored).toBeNull();
    });

    it('resolves the base URL from the credential source, not the stored config', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
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
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        environmentId: 'env_stored_123',
        baseUrl: 'https://stored.example.com',
      });

      const active = await resolveActiveEnvironment();

      expect(active.baseUrl).toBe('https://stored.example.com');
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
