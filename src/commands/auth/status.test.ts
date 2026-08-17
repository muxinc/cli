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

  it('lists both credential kinds with their auth type', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toContain('acme-production');
    expect(printed).toContain('oauth');
    expect(printed).toContain('ci-token');
    expect(printed).toContain('token');
  });

  it('shows the organization and environment for an OAuth login', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);

    expect(output()).toContain('Acme Inc');
    expect(output()).toContain('Production');
  });

  it('marks the active stored environment', async () => {
    await storeBothKinds();

    await statusCommand.parse([]);
    const rows = output()
      .split('\n')
      .filter((line) => /^[* ] \S/.test(line));

    expect(rows).toContainEqual(expect.stringMatching(/^\* acme-production/));
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}ci-token/));
  });

  it('reports the access token expiry without a network call', async () => {
    await storeBothKinds();
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new Error('network should not be reached');
      }) as unknown as typeof fetch,
    );

    try {
      await statusCommand.parse([]);

      expect(output()).toMatch(/expires in \d+m|expired/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('says an expired token will refresh on next use', async () => {
    await setEnvironment('acme-production', {
      oauth: {
        accessToken: 'access_1',
        refreshToken: 'refresh_1',
        expiresAt: nowSeconds() - 60,
      },
      environmentId: 'env_123',
    });

    await statusCommand.parse([]);

    expect(output()).toMatch(/expired/i);
    expect(output()).toMatch(/refresh/i);
  });

  it('explains that environment variables shadow the stored selection', async () => {
    await storeBothKinds();
    process.env.MUX_TOKEN_ID = 'env_token_id';
    process.env.MUX_TOKEN_SECRET = 'env_token_secret';

    await statusCommand.parse([]);
    const printed = output();

    expect(printed).toContain('MUX_TOKEN_ID');
    expect(printed).toMatch(/precedence|shadow/i);
    expect(printed).toContain('acme-production');
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
