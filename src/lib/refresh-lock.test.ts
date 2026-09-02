import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
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

  it('refuses to break the lock of a live holder', async () => {
    // A young lock held by a running process cannot be abandoned. Deleting it
    // would put two processes on the same rotating refresh token, so acquiring
    // must fail instead — and it must fail rather than hang forever.
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
        owner: 'someone-else',
      }),
    );

    await expect(
      withRefreshLock(async () => 'should not run', { timeoutMs: 150 }),
    ).rejects.toThrow(/another mux process/i);

    // The other holder's lock survives untouched.
    const contents = JSON.parse(await readFile(getRefreshLockPath(), 'utf-8'));
    expect(contents.owner).toBe('someone-else');
  });

  it('does not release a lock it no longer owns', async () => {
    // Simulates this process's lock having been broken as stale and re-taken by
    // another process while the critical section was still running: releasing
    // must not delete the new holder's lock.
    await withRefreshLock(async () => {
      await Bun.write(
        getRefreshLockPath(),
        JSON.stringify({
          pid: process.pid,
          acquiredAt: Date.now(),
          owner: 'new-holder',
        }),
      );
    });

    expect(existsSync(getRefreshLockPath())).toBe(true);
    const contents = JSON.parse(await readFile(getRefreshLockPath(), 'utf-8'));
    expect(contents.owner).toBe('new-holder');
  });

  it('waits for a live holder that finishes in time', async () => {
    // The waiter polls rather than failing immediately: a holder doing normal
    // work should be waited out, not interrupted.
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
        owner: 'brief-holder',
      }),
    );
    setTimeout(() => {
      void unlink(path).catch(() => {});
    }, 60);

    expect(
      await withRefreshLock(async () => 'acquired', { timeoutMs: 5000 }),
    ).toBe('acquired');
  });
});
