import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigDir } from './xdg.ts';

/**
 * Cross-process mutual exclusion for token refresh.
 *
 * Several `mux` invocations can run at once — an ad-hoc command beside a
 * long-lived `mux webhooks listen` — and an authorization server that rotates
 * refresh tokens invalidates the old one on use. Without a lock, two processes
 * refreshing together would spend the same refresh token twice and one would be
 * left holding a dead credential.
 */

/**
 * A lock older than this is assumed abandoned (crash, SIGKILL).
 *
 * A holder's critical section is a config read, one token request bounded by the
 * timeout in oauth.ts, and a config write — comfortably inside this window.
 */
const STALE_AFTER_MS = 30_000;

/**
 * How long to wait before giving up. Deliberately longer than STALE_AFTER_MS so
 * that an abandoned lock is always broken by the staleness check first: a waiter
 * must never delete the lock of a holder that is alive and making progress,
 * because that would put two processes on the same rotating refresh token — the
 * exact thing this lock exists to prevent.
 */
const ACQUIRE_TIMEOUT_MS = 60_000;

const POLL_INTERVAL_MS = 25;

interface LockContents {
  pid: number;
  acquiredAt: number;
  /** Distinguishes this acquisition from any other, including same-pid retries. */
  owner: string;
}

export function getRefreshLockPath(): string {
  return join(getConfigDir(), 'refresh.lock');
}

/** Whether a pid is still running. EPERM means alive but not ours to signal. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Decide whether an existing lock can be broken. Unreadable or malformed lock
 * files are treated as abandoned: leaving one in place would wedge refresh for
 * every future invocation.
 */
async function isBreakable(path: string): Promise<boolean> {
  let contents: LockContents;
  try {
    contents = JSON.parse(await readFile(path, 'utf-8')) as LockContents;
  } catch {
    return true;
  }

  if (
    typeof contents.pid !== 'number' ||
    typeof contents.acquiredAt !== 'number'
  ) {
    return true;
  }
  if (Date.now() - contents.acquiredAt > STALE_AFTER_MS) {
    return true;
  }

  return !processAlive(contents.pid);
}

export interface RefreshLockOptions {
  /** Override how long to wait for another holder. Intended for tests. */
  timeoutMs?: number;
}

/** Acquire the lock, returning the owner token that proves this acquisition. */
async function acquire(path: string, timeoutMs: number): Promise<string> {
  await mkdir(getConfigDir(), { recursive: true, mode: 0o700 });

  const deadline = Date.now() + timeoutMs;
  const stagingPath = `${path}.${process.pid}.${randomBytes(4).toString('hex')}`;

  while (true) {
    const owner = randomBytes(8).toString('hex');

    // Stage the full contents first, then link it into place. `link` fails when
    // the target exists, which makes acquisition atomic, and the lock file is
    // never observable in a half-written state — a competitor that read an
    // empty lock file would mistake a live holder for a crashed one.
    await writeFile(
      stagingPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), owner }),
      { mode: 0o600 },
    );

    try {
      await link(stagingPath, path);
      return owner;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    } finally {
      await unlink(stagingPath).catch(() => {});
    }

    if (await isBreakable(path)) {
      await unlink(path).catch(() => {});
      continue;
    }

    if (Date.now() > deadline) {
      // The holder is alive and still working: a lock this young cannot be
      // abandoned, since STALE_AFTER_MS would have broken it first. Failing is
      // the safe outcome — deleting a live holder's lock would put two
      // processes on the same rotating refresh token.
      throw new Error(
        `Timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for another mux process to finish refreshing credentials. If no other mux command is running, delete ${path} and try again.`,
      );
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }
}

/** Release only if this acquisition still owns the lock. */
async function release(path: string, owner: string): Promise<void> {
  try {
    const contents = JSON.parse(await readFile(path, 'utf-8')) as LockContents;
    // Someone else's lock: ours was already broken as stale, and unlinking now
    // would cascade the problem onto whoever holds it.
    if (contents.owner !== owner) return;
  } catch {
    // Missing or unreadable: nothing of ours to release.
    return;
  }

  await unlink(path).catch(() => {});
}

/**
 * Run `critical` while holding the refresh lock. The lock is always released,
 * including when `critical` throws.
 */
export async function withRefreshLock<T>(
  critical: () => Promise<T>,
  options: RefreshLockOptions = {},
): Promise<T> {
  const path = getRefreshLockPath();
  const owner = await acquire(path, options.timeoutMs ?? ACQUIRE_TIMEOUT_MS);

  try {
    return await critical();
  } finally {
    await release(path, owner);
  }
}
