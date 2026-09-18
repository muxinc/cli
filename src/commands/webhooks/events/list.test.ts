import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setEnvironment } from '@/lib/config.ts';
import { appendEvent, closeDb } from '@/lib/events-store.ts';
import { listCommand } from './list.ts';

function makeEvent(id: string, environmentId: string) {
  return {
    id,
    type: 'video.asset.ready',
    timestamp: new Date().toISOString(),
    environmentId,
    payload: { id },
  };
}

describe('mux webhooks events list command', () => {
  let testDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalXdgDataHome: string | undefined;
  let originalTokenId: string | undefined;
  let originalTokenSecret: string | undefined;
  let logSpy: Mock<typeof console.log>;
  let errorSpy: Mock<typeof console.error>;
  let exitSpy: Mock<typeof process.exit>;
  let fetchSpy: Mock<typeof fetch> | undefined;

  function mockWhoami(environmentId: string) {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(
          JSON.stringify({ data: { environment_id: environmentId } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as unknown as typeof fetch,
    );
  }

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    originalTokenId = process.env.MUX_TOKEN_ID;
    originalTokenSecret = process.env.MUX_TOKEN_SECRET;
    process.env.XDG_CONFIG_HOME = testDir;
    process.env.XDG_DATA_HOME = testDir;
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
    closeDb();

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
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }
    if (originalTokenId === undefined) delete process.env.MUX_TOKEN_ID;
    else process.env.MUX_TOKEN_ID = originalTokenId;
    if (originalTokenSecret === undefined) delete process.env.MUX_TOKEN_SECRET;
    else process.env.MUX_TOKEN_SECRET = originalTokenSecret;
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    exitSpy?.mockRestore();
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    closeDb();
    await rm(testDir, { recursive: true, force: true });
  });

  function jsonOutput(): Array<{ id: string }> {
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    return JSON.parse(output);
  }

  test('lists events for the stored environment id when logged in', async () => {
    await setEnvironment('default', {
      token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      environmentId: 'env_stored_123',
    });
    appendEvent(makeEvent('evt_stored', 'env_stored_123'));
    appendEvent(makeEvent('evt_other', 'env_other_456'));

    await listCommand.parse(['--json']);

    const events = jsonOutput();
    expect(events.map((e) => e.id)).toEqual(['evt_stored']);
  });

  test('lists events for the env var credentials environment, not the stored one', async () => {
    await setEnvironment('default', {
      token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
      environmentId: 'env_stored_123',
    });
    appendEvent(makeEvent('evt_stored', 'env_stored_123'));
    appendEvent(makeEvent('evt_other', 'env_other_456'));
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';
    mockWhoami('env_other_456');

    await listCommand.parse(['--json']);

    const events = jsonOutput();
    expect(events.map((e) => e.id)).toEqual(['evt_other']);
  });

  test('works with env var credentials and no stored config', async () => {
    appendEvent(makeEvent('evt_env_only', 'env_from_vars'));
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';
    mockWhoami('env_from_vars');

    await listCommand.parse(['--json']);

    const events = jsonOutput();
    expect(events.map((e) => e.id)).toEqual(['evt_env_only']);
  });

  test('emits a JSON error when no credentials are available', async () => {
    try {
      await listCommand.parse(['--json']);
    } catch (_error) {
      // Expected to throw via mocked process.exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(parsed.error).toMatch(/MUX_TOKEN_ID/);
  });
});
