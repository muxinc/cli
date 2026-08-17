import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRefreshLockPath, withRefreshLock } from './refresh-lock.ts';

let testConfigDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-lock-test-'));
  originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = testConfigDir;
});

afterEach(async () => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  await rm(testConfigDir, { recursive: true, force: true });
});

describe('withRefreshLock', () => {
  it('runs the critical section and returns its value', async () => {
    expect(await withRefreshLock(async () => 'refreshed')).toBe('refreshed');
  });

  it('releases the lock after a successful run', async () => {
    await withRefreshLock(async () => 'first');

    expect(existsSync(getRefreshLockPath())).toBe(false);
    expect(await withRefreshLock(async () => 'second')).toBe('second');
  });

  it('releases the lock when the critical section throws', async () => {
    expect(
      withRefreshLock(async () => {
        throw new Error('refresh failed');
      }),
    ).rejects.toThrow('refresh failed');

    // Give the rejection a turn to settle before asserting on the lock file.
    await Bun.sleep(10);
    expect(existsSync(getRefreshLockPath())).toBe(false);
    expect(await withRefreshLock(async () => 'after')).toBe('after');
  });

  it('serializes concurrent critical sections', async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        withRefreshLock(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await Bun.sleep(15);
          order.push(n);
          active -= 1;
        }),
      ),
    );

    expect(maxActive).toBe(1);
    expect(order.length).toBe(4);
  });

  it('records the owning pid so stale locks can be identified', async () => {
    let contents = '';
    await withRefreshLock(async () => {
      contents = await readFile(getRefreshLockPath(), 'utf-8');
    });

    expect(JSON.parse(contents).pid).toBe(process.pid);
  });

  it('breaks a lock left behind by a dead process', async () => {
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    expect(await withRefreshLock(async () => 'recovered')).toBe('recovered');
  });

  it('breaks a lock older than the stale threshold', async () => {
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now() - 60_000,
      }),
    );

    expect(await withRefreshLock(async () => 'recovered')).toBe('recovered');
  });

  it('breaks a lock whose contents are unreadable', async () => {
    await Bun.write(getRefreshLockPath(), 'not json');

    expect(await withRefreshLock(async () => 'recovered')).toBe('recovered');
  });
});
