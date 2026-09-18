import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  breakStaleLock,
  getRefreshLockPath,
  withRefreshLock,
} from './refresh-lock.ts';

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

  it('never admits two holders when many waiters contend across normal releases', async () => {
    // A waiter that saw the lock held, then found it gone because the holder
    // released, used to go down the break path and unlink "the" lock — which
    // by then could be one a third contender had just linked. The window is a
    // few syscalls wide, so this is a volume test: it cannot fail on correct
    // code, and caught the faulty code in roughly seven runs out of ten. A
    // failure here is real even if a rerun passes.
    let active = 0;
    let overlaps = 0;

    for (let round = 0; round < 10; round += 1) {
      await Promise.all(
        Array.from({ length: 80 }, () =>
          withRefreshLock(async () => {
            active += 1;
            if (active > 1) overlaps += 1;
            await Bun.sleep(0);
            active -= 1;
          }),
        ),
      );
    }

    expect(overlaps).toBe(0);
  }, 30_000);

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

  it('recovers a lock file it cannot read', async () => {
    // Left by a run under another user, for example. Unreadable is not the
    // same as released: it still blocks the link, so it has to be removed.
    const path = getRefreshLockPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'unreadable', { mode: 0o000 });

    expect(await withRefreshLock(async () => 'ran', { timeoutMs: 2000 })).toBe(
      'ran',
    );
  });

  it('gives up with guidance, rather than spinning, on a lock it can neither read nor remove', async () => {
    // A directory at the lock path: the link fails, the read fails, and the
    // unlink fails. Every pass through the acquire loop has to be bounded.
    const path = getRefreshLockPath();
    await mkdir(path, { recursive: true });

    await expect(
      withRefreshLock(async () => 'ran', { timeoutMs: 300 }),
    ).rejects.toThrow(/Timed out/);
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

  it('serializes waiters recovering from the same crashed holder', async () => {
    // Recovery adds await points between deciding a lock is abandoned and
    // acting on it, which is enough for waiters in one process to interleave:
    // this fails with two concurrent critical sections if breaking stops being
    // serialized, and both would be spending the same rotating refresh token.
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({
        pid: 2 ** 30,
        acquiredAt: Date.now(),
        owner: 'crashed-holder',
      }),
    );

    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        withRefreshLock(
          async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await Bun.sleep(10);
            active -= 1;
            completed.push(n);
          },
          { timeoutMs: 10_000 },
        ),
      ),
    );

    expect(maxActive).toBe(1);
    expect(completed.length).toBe(6);
  });

  it('leaves nothing behind after recovering from a crashed holder', async () => {
    // A leaked lock, staging, or mutex file would wedge or weaken every later
    // acquisition.
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    await Promise.all(
      [1, 2, 3, 4].map(() => withRefreshLock(async () => Bun.sleep(5))),
    );

    expect(await readdir(dirname(getRefreshLockPath()))).toEqual([]);
  });

  it('recovers when a previous break was itself interrupted', async () => {
    // A process killed mid-break leaves its mutex behind. If that wedged
    // breaking, every later invocation would be stuck behind a dead holder.
    await Bun.write(
      getRefreshLockPath(),
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );
    await Bun.write(
      `${getRefreshLockPath()}.break`,
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    expect(
      await withRefreshLock(async () => 'recovered', { timeoutMs: 5000 }),
    ).toBe('recovered');
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

describe('breakStaleLock', () => {
  it('removes a lock left behind by a dead process', async () => {
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    expect(await breakStaleLock(path)).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it('has nothing to remove, and says to retry, when the lock is already gone', async () => {
    // The holder released between the caller's decision and this call. Retrying
    // the link is right; unlinking is not, since the path may be re-linked by
    // a live holder at any moment.
    const path = getRefreshLockPath();
    await mkdir(dirname(path), { recursive: true });

    expect(await breakStaleLock(path)).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it('refuses to delete a lock that stopped being stale', async () => {
    // The interleaving the mutex exists to arbitrate: a waiter decided the lock
    // was abandoned, and by the time it acts a new holder has linked a fresh
    // one. Deleting that would put both processes on the same rotating refresh
    // token, so staleness is re-checked here rather than trusted.
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
        owner: 'new-holder',
      }),
    );

    expect(await breakStaleLock(path)).toBe(false);

    const contents = JSON.parse(await readFile(path, 'utf-8'));
    expect(contents.owner).toBe('new-holder');
  });

  it('leaves a mutex held by a live waiter alone', async () => {
    // Clearing an abandoned mutex is itself a check-then-act step, so it has to
    // prove the mutex it removes is the one it judged. Deleting a live waiter's
    // mutex would let two waiters break at once, which is what this whole
    // serialization exists to prevent.
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );
    const breakPath = `${path}.break`;
    await Bun.write(
      breakPath,
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
        owner: 'live-breaker',
      }),
    );

    expect(await breakStaleLock(path)).toBe(false);

    const contents = JSON.parse(await readFile(breakPath, 'utf-8'));
    expect(contents.owner).toBe('live-breaker');
    // The lock the live waiter is working on survives too.
    expect(existsSync(path)).toBe(true);
  });

  it('lets only one of several waiters break the same lock', async () => {
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => breakStaleLock(path)),
    );

    expect(results.filter(Boolean).length).toBe(1);
  });

  it('leaves no mutex behind for the next waiter', async () => {
    const path = getRefreshLockPath();
    await Bun.write(
      path,
      JSON.stringify({ pid: 2 ** 30, acquiredAt: Date.now() }),
    );

    await breakStaleLock(path);

    expect(await readdir(dirname(path))).toEqual([]);
  });
});
