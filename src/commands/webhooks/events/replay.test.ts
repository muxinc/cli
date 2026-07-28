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
import { closeDb } from '@/lib/events-store.ts';
import { replayCommand } from './replay.ts';

describe('mux webhooks events replay command', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalXdgDataHome: string | undefined;
  let logSpy: Mock<typeof console.log>;
  let errorSpy: Mock<typeof console.error>;
  let exitSpy: Mock<typeof process.exit>;

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_CONFIG_HOME = join(testConfigDir, 'cfg');
    process.env.XDG_DATA_HOME = join(testConfigDir, 'data');
    // The events store caches its sqlite handle module-wide; drop any handle
    // another test file opened against its own (possibly deleted) temp dir.
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
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    exitSpy?.mockRestore();
    closeDb();
    await rm(testConfigDir, { recursive: true, force: true });
  });

  function stderrJson(): Record<string, unknown> {
    return JSON.parse(String(errorSpy.mock.calls[0][0]));
  }

  test('missing event ID and --count is a JSON error in JSON mode', async () => {
    try {
      await replayCommand.parse(['--json']);
    } catch (_error) {
      // Expected to throw via mocked process.exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(String(stderrJson().error)).toContain('--count');
  });

  test('event ID combined with --count is a JSON error in JSON mode', async () => {
    try {
      await replayCommand.parse(['evt_1', '--count', '2', '--json']);
    } catch (_error) {
      // Expected to throw via mocked process.exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(String(stderrJson().error)).toContain('Cannot use both');
  });

  test('unknown event ID is a JSON error in JSON mode', async () => {
    await setEnvironment('default', {
      tokenId: 'stored_id',
      tokenSecret: 'stored_secret',
      environmentId: 'env_replay_qa_isolated',
    });

    try {
      await replayCommand.parse(['evt_does_not_exist', '--json']);
    } catch (_error) {
      // Expected to throw via mocked process.exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(String(stderrJson().error)).toContain('Event not found');
  });

  test('empty replay set emits JSON in JSON mode', async () => {
    await setEnvironment('default', {
      tokenId: 'stored_id',
      tokenSecret: 'stored_secret',
      environmentId: 'env_replay_qa_isolated',
    });

    await replayCommand.parse(['--count', '5', '--json']);

    expect(exitSpy).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(JSON.parse(output)).toEqual([]);
  });
});
