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
  getCurrentEnvironment,
  listEnvironments,
  setEnvironment,
} from '../lib/config.ts';
import { setAgentMode, setJsonFlag } from '../lib/context.ts';
import { logoutCommand } from './logout.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;
let savedOAuthEnv: Record<string, string | undefined>;
let logSpy: Mock<typeof console.log>;
let errorSpy: Mock<typeof console.error>;
let exitSpy: Mock<typeof process.exit>;
let fetchSpy: Mock<typeof fetch> | undefined;

const OAUTH_ENV_KEYS = ['MUX_OAUTH_CLIENT_ID', 'MUX_OAUTH_REVOKE_URL'] as const;

function stdout(): string {
  return logSpy.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
}

/** Revocation succeeds; discovery 404s so only the revoke call is counted. */
function mockRevocation(status = 200) {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string,
  ) => {
    if (String(input).includes('/.well-known/')) {
      return new Response('not found', { status: 404 });
    }
    return new Response('{}', { status });
  }) as unknown as typeof fetch);
  return fetchSpy;
}

function revocationCalls(): string[] {
  return (fetchSpy?.mock.calls ?? [])
    .map((call) => String(call[0]))
    .filter((url) => !url.includes('/.well-known/'));
}

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-logout-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
  process.env.XDG_CACHE_HOME = testConfigDir;

  savedOAuthEnv = {};
  for (const key of OAUTH_ENV_KEYS) {
    savedOAuthEnv[key] = process.env[key];
  }
  process.env.MUX_OAUTH_CLIENT_ID = 'test_client';
  process.env.MUX_OAUTH_REVOKE_URL = 'https://api.test/oauth/revoke';

  logSpy = spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  delete process.env.XDG_CACHE_HOME;
  for (const key of OAUTH_ENV_KEYS) {
    if (savedOAuthEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedOAuthEnv[key];
    }
  }
  logSpy?.mockRestore();
  errorSpy?.mockRestore();
  exitSpy?.mockRestore();
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  setAgentMode(false);
  setJsonFlag(false);
  await rm(testConfigDir, { recursive: true, force: true });
});

async function seed() {
  await setEnvironment('acme-production', {
    environmentId: 'env_123',
    oauth: {
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: 4_102_444_800,
    },
  });
  await setEnvironment('ci-token', {
    environmentId: 'env_456',
    token: { tokenId: 'ci_id', tokenSecret: 'ci_secret' },
  });
}

describe('mux logout', () => {
  it('removes a named environment', async () => {
    await seed();
    mockRevocation();

    await logoutCommand.parse(['ci-token']);

    expect(await listEnvironments()).toEqual(['acme-production']);
  });

  it('revokes the refresh token for an OAuth login', async () => {
    await seed();
    mockRevocation();

    await logoutCommand.parse(['acme-production']);

    expect(revocationCalls()).toEqual(['https://api.test/oauth/revoke']);
  });

  it('does not call revocation for an access token environment', async () => {
    await seed();
    mockRevocation();

    await logoutCommand.parse(['ci-token']);

    expect(revocationCalls()).toEqual([]);
  });

  it('removes the credentials even when revocation fails', async () => {
    await seed();
    mockRevocation(500);

    await logoutCommand.parse(['acme-production']);

    expect(await listEnvironments()).toEqual(['ci-token']);
    expect(stderr()).toContain('Could not revoke');
  });

  it('selects a new current environment when the active one is removed', async () => {
    await seed();
    mockRevocation();

    await logoutCommand.parse(['acme-production']);

    expect((await getCurrentEnvironment())?.name).toBe('ci-token');
  });

  it('errors when no name is given', async () => {
    await seed();

    try {
      await logoutCommand.parse([]);
    } catch {
      // the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('--all');
  });

  it('errors on an unknown environment', async () => {
    await seed();

    try {
      await logoutCommand.parse(['nope']);
    } catch {
      // exits
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('does not exist');
  });

  describe('--all', () => {
    it('removes every environment', async () => {
      await seed();
      mockRevocation();

      await logoutCommand.parse(['--all']);

      expect(await listEnvironments()).toEqual([]);
    });

    it('revokes each OAuth login it removes', async () => {
      await seed();
      mockRevocation();

      await logoutCommand.parse(['--all']);

      expect(revocationCalls()).toHaveLength(1);
    });

    it('reports an empty config without failing', async () => {
      await logoutCommand.parse(['--all']);

      expect(exitSpy).not.toHaveBeenCalled();
      expect(stdout()).toContain('No environments configured');
    });
  });

  describe('--json', () => {
    it('emits the removed environments and the new current one', async () => {
      await seed();
      mockRevocation();

      await logoutCommand.parse(['acme-production', '--json']);
      const parsed = JSON.parse(stdout());

      expect(parsed.success).toBe(true);
      expect(parsed.removed).toEqual(['acme-production']);
      expect(parsed.current_environment).toBe('ci-token');
      expect(parsed.warnings).toEqual([]);
    });

    it('reports a revocation failure as a warning rather than prose', async () => {
      await seed();
      mockRevocation(500);

      await logoutCommand.parse(['acme-production', '--json']);
      const parsed = JSON.parse(stdout());

      expect(parsed.success).toBe(true);
      expect(parsed.warnings[0]).toContain('Could not revoke');
      // Machine-readable mode must not mix prose into stderr.
      expect(stderr()).toBe('');
    });

    it('reports errors as JSON', async () => {
      await seed();

      try {
        await logoutCommand.parse(['nope', '--json']);
      } catch {
        // exits
      }

      expect(JSON.parse(stderr()).error).toContain('does not exist');
    });

    it('never prints token material', async () => {
      await seed();
      mockRevocation();

      await logoutCommand.parse(['--all', '--json']);

      expect(stdout()).not.toContain('refresh_1');
      expect(stdout()).not.toContain('ci_secret');
    });
  });
});
