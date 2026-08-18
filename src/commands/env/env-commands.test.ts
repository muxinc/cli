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
import { getCurrentEnvironment, setEnvironment } from '@/lib/config.ts';
import { setAgentMode, setJsonFlag } from '@/lib/context.ts';
import { listCommand } from './list.ts';
import { switchCommand } from './switch.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;
let savedTokenId: string | undefined;
let savedTokenSecret: string | undefined;
let logSpy: Mock<typeof console.log>;
let errorSpy: Mock<typeof console.error>;
let exitSpy: Mock<typeof process.exit>;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function stdout(): string {
  return logSpy.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
}

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-env-cmds-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
  savedTokenId = process.env.MUX_TOKEN_ID;
  savedTokenSecret = process.env.MUX_TOKEN_SECRET;
  delete process.env.MUX_TOKEN_ID;
  delete process.env.MUX_TOKEN_SECRET;

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
  if (savedTokenId === undefined) delete process.env.MUX_TOKEN_ID;
  else process.env.MUX_TOKEN_ID = savedTokenId;
  if (savedTokenSecret === undefined) delete process.env.MUX_TOKEN_SECRET;
  else process.env.MUX_TOKEN_SECRET = savedTokenSecret;
  logSpy?.mockRestore();
  errorSpy?.mockRestore();
  exitSpy?.mockRestore();
  setAgentMode(false);
  setJsonFlag(false);
  await rm(testConfigDir, { recursive: true, force: true });
});

async function seedEnvironments() {
  await setEnvironment('acme-production', {
    environmentId: 'env_123',
    environmentName: 'Production',
    organizationName: 'Acme Inc',
    oauth: {
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      expiresAt: nowSeconds() + 2700,
    },
    token: { tokenId: 'pair_id', tokenSecret: 'pair_secret' },
  });
  await setEnvironment('ci-token', {
    environmentId: 'env_456',
    token: { tokenId: 'ci_id', tokenSecret: 'ci_secret' },
  });
}

describe('mux env list', () => {
  it('reports an empty config in both formats', async () => {
    await listCommand.parse([]);
    expect(stdout()).toContain('No environments configured');

    logSpy.mockClear();
    await listCommand.parse(['--json']);
    expect(JSON.parse(stdout())).toEqual({ environments: [], current: null });
  });

  it('shows the credential kinds an environment holds, preferred first', async () => {
    await seedEnvironments();

    await listCommand.parse([]);

    expect(stdout()).toContain('oauth+token');
    expect(stdout()).toContain('Acme Inc / Production');
  });

  it('marks the current environment', async () => {
    await seedEnvironments();

    await listCommand.parse([]);
    const row = stdout()
      .split('\n')
      .find((line) => line.includes('acme-production'));

    expect(row).toStartWith('*');
    expect(row).toContain('(current)');
  });

  it('emits structured JSON without token material', async () => {
    await seedEnvironments();

    await listCommand.parse(['--json']);
    const parsed = JSON.parse(stdout());

    expect(parsed.current).toBe('acme-production');
    const production = parsed.environments.find(
      (e: { name: string }) => e.name === 'acme-production',
    );
    expect(production.auth).toEqual(['oauth', 'token']);
    expect(production.preferred).toBe('oauth');
    expect(production.environment_id).toBe('env_123');
    expect(production.expires_at).toBeGreaterThan(nowSeconds());
    expect(stdout()).not.toContain('access_1');
    expect(stdout()).not.toContain('pair_secret');
  });

  it('surfaces a flagged credential as a warning', async () => {
    await setEnvironment('broken', {
      environmentId: 'env_dead',
      oauth: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: nowSeconds() + 600,
        lastError: { code: 'invalid_grant', at: '2026-08-15T00:00:00Z' },
      },
    });

    await listCommand.parse([]);
    expect(stdout()).toContain('invalid_grant');

    logSpy.mockClear();
    await listCommand.parse(['--json']);
    expect(JSON.parse(stdout()).environments[0].warning).toContain(
      'invalid_grant',
    );
  });

  it('warns that environment variables outrank the selection', async () => {
    await seedEnvironments();
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';

    await listCommand.parse([]);

    expect(stdout()).toContain('take precedence');
  });
});

describe('mux env switch', () => {
  it('switches to a named environment', async () => {
    await seedEnvironments();

    await switchCommand.parse(['ci-token']);

    expect((await getCurrentEnvironment())?.name).toBe('ci-token');
    expect(stdout()).toContain('ci-token');
  });

  it('rejects an unknown environment without changing the selection', async () => {
    await seedEnvironments();

    try {
      await switchCommand.parse(['nope']);
    } catch {
      // the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('does not exist');
    expect((await getCurrentEnvironment())?.name).toBe('acme-production');
  });

  it('reports an unknown environment as JSON with --json', async () => {
    await seedEnvironments();

    try {
      await switchCommand.parse(['nope', '--json']);
    } catch {
      // exits
    }

    expect(JSON.parse(stderr()).error).toContain('does not exist');
  });

  it('emits structured JSON on success', async () => {
    await seedEnvironments();

    await switchCommand.parse(['ci-token', '--json']);
    const parsed = JSON.parse(stdout());

    expect(parsed).toEqual({
      success: true,
      environment: 'ci-token',
      shadowed_by_environment_variables: false,
    });
  });

  it('tells a machine caller when the switch is shadowed by env vars', async () => {
    await seedEnvironments();
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';

    await switchCommand.parse(['ci-token', '--json']);

    expect(JSON.parse(stdout()).shadowed_by_environment_variables).toBe(true);
  });

  it('refuses to prompt with no argument when output must stay parseable', async () => {
    await seedEnvironments();

    try {
      await switchCommand.parse(['--json']);
    } catch {
      // exits
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(JSON.parse(stderr()).error).toContain('Specify an environment name');
  });

  it('reports an empty config rather than prompting', async () => {
    try {
      await switchCommand.parse([]);
    } catch {
      // exits
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('No environments configured');
  });
});
