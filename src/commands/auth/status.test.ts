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
import { setEnvironment } from '@/lib/config.ts';
import { setAgentMode, setJsonFlag } from '@/lib/context.ts';
import { statusCommand } from './status.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;
let savedTokenId: string | undefined;
let savedTokenSecret: string | undefined;
let logSpy: Mock<typeof console.log>;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Everything the command printed, as one string. */
function output(): string {
  return logSpy.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
}

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-auth-status-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
  savedTokenId = process.env.MUX_TOKEN_ID;
  savedTokenSecret = process.env.MUX_TOKEN_SECRET;
  delete process.env.MUX_TOKEN_ID;
  delete process.env.MUX_TOKEN_SECRET;
  logSpy = spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  if (savedTokenId === undefined) delete process.env.MUX_TOKEN_ID;
  else process.env.MUX_TOKEN_ID = savedTokenId;
  if (savedTokenSecret === undefined) delete process.env.MUX_TOKEN_SECRET;
  else process.env.MUX_TOKEN_SECRET = savedTokenSecret;
  logSpy?.mockRestore();
  setAgentMode(false);
  setJsonFlag(false);
  await rm(testConfigDir, { recursive: true, force: true });
});

async function storeBothKinds() {
  await setEnvironment('acme-production', {
    oauth: {
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: nowSeconds() + 2820,
    },
    environmentId: 'env_123',
    environmentName: 'Production',
    organizationName: 'Acme Inc',
  });
  await setEnvironment('ci-token', {
    token: { tokenId: 'token_id_value', tokenSecret: 'token_secret_value' },
    environmentId: 'env_456',
  });
}

describe('mux auth status', () => {
  it('reports when nothing is configured', async () => {
    await statusCommand.parse([]);

    expect(output()).toMatch(/not (logged in|signed in)|no credentials/i);
    expect(output()).toContain('mux login');
  });

  it('describes credential kinds in words rather than internal names', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toContain('acme-production');
    expect(printed).toContain('browser sign-in');
    expect(printed).toContain('ci-token');
    expect(printed).toContain('access token');
  });

  it('says which credential an environment with both actually uses', async () => {
    await storeBothKinds();
    await setEnvironment('acme-production', {
      environmentId: 'env_123',
      environmentName: 'Production',
      organizationName: 'Acme Inc',
      oauth: {
        accessToken: 'access_1',
        refreshToken: 'refresh_1',
        expiresAt: nowSeconds() + 2820,
      },
      token: { tokenId: 'id', tokenSecret: 'secret' },
    });

    await statusCommand.parse([]);

    expect(output()).toContain('browser sign-in (also has access token)');
  });

  it('shows the organization and environment for an OAuth login', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);

    expect(output()).toContain('Acme Inc');
    expect(output()).toContain('Production');
  });

  it('names the active environment without needing a marker legend', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toMatch(/^Active: +acme-production$/m);
    // The old asterisk-plus-legend format is gone.
    expect(printed).not.toContain('* =');
    expect(printed).not.toMatch(/^\* /m);
  });

  it('lists the environments that are not active separately', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toContain('Other environments (1):');
    expect(printed).toContain('ci-token');
    expect(printed).toContain('mux env switch <name>');
  });

  it('says nothing about other environments when there is only one', async () => {
    await setEnvironment('only-one', {
      environmentId: 'env_1',
      oauth: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: nowSeconds() + 600,
      },
    });

    await statusCommand.parse([]);

    expect(output()).not.toContain('Other environments');
  });

  it('reads everything locally, with no network call', async () => {
    await storeBothKinds();
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new Error('network should not be reached');
      }) as unknown as typeof fetch,
    );

    try {
      await statusCommand.parse([]);

      expect(output()).toContain('acme-production');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not mention expiry, which needs no action from the reader', async () => {
    // An expiring access token is refreshed automatically. Saying "expired"
    // only invites someone to re-login when nothing is wrong.
    await setEnvironment('acme-production', {
      oauth: {
        accessToken: 'access_1',
        refreshToken: 'refresh_1',
        expiresAt: nowSeconds() - 60,
      },
      environmentId: 'env_123',
    });

    await statusCommand.parse([]);

    expect(output()).not.toMatch(/expire/i);
  });

  it('explains that environment variables shadow the stored selection', async () => {
    await storeBothKinds();
    process.env.MUX_TOKEN_ID = 'env_token_id';
    process.env.MUX_TOKEN_SECRET = 'env_token_secret';

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toContain('MUX_TOKEN_ID');
    expect(printed).toMatch(/precedence/i);
    expect(printed).toContain('acme-production');
    expect(printed).toMatch(/unset/i);
    // Every saved login is listed, since none of them is active — including the
    // one that would take over if the variables were unset.
    expect(printed).toContain('Saved logins (2):');
    expect(printed).toContain('(selected)');
  });

  it('never prints token material', async () => {
    await storeBothKinds();
    process.env.MUX_TOKEN_ID = 'env_token_id';
    process.env.MUX_TOKEN_SECRET = 'env_token_secret';

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).not.toContain('access_1');
    expect(printed).not.toContain('refresh_1');
    expect(printed).not.toContain('token_secret_value');
    expect(printed).not.toContain('env_token_secret');
  });

  it('emits structured JSON with --json and no token material', async () => {
    await storeBothKinds();

    await statusCommand.parse(['--json']);
    const parsed = JSON.parse(output());

    expect(parsed.active.source).toBe('config');
    expect(parsed.active.environment).toBe('acme-production');
    expect(parsed.environments).toHaveLength(2);
    const names = parsed.environments.map((e: { name: string }) => e.name);
    expect(names).toContain('acme-production');
    expect(names).toContain('ci-token');
    expect(JSON.stringify(parsed)).not.toContain('access_1');
    expect(JSON.stringify(parsed)).not.toContain('token_secret_value');
  });

  it('reports the environment variable source in JSON when it shadows', async () => {
    await storeBothKinds();
    process.env.MUX_TOKEN_ID = 'env_token_id';
    process.env.MUX_TOKEN_SECRET = 'env_token_secret';

    await statusCommand.parse(['--json']);
    const parsed = JSON.parse(output());

    expect(parsed.active.source).toBe('env');
    expect(parsed.active.shadows).toBe('acme-production');
  });
});
