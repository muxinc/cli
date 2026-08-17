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

/** A lock older than this is assumed abandoned (crash, SIGKILL). */
const STALE_AFTER_MS = 30_000;

/** How long to wait for another process before breaking the lock. */
const ACQUIRE_TIMEOUT_MS = 15_000;

const POLL_INTERVAL_MS = 25;

interface LockContents {
  pid: number;
  acquiredAt: number;
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

async function acquire(path: string): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true, mode: 0o700 });

  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  const stagingPath = `${path}.${process.pid}.${randomBytes(4).toString('hex')}`;

  while (true) {
    // Stage the full contents first, then link it into place. `link` fails when
    // the target exists, which makes acquisition atomic, and the lock file is
    // never observable in a half-written state — a competitor that read an
    // empty lock file would mistake a live holder for a crashed one.
    await writeFile(
      stagingPath,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
      { mode: 0o600 },
    );

    try {
      await link(stagingPath, path);
      return;
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
      // The holder is alive but stuck. Breaking in is better than failing every
      // command from here on; the holder's own write is atomic either way.
      await unlink(path).catch(() => {});
      continue;
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Run `critical` while holding the refresh lock. The lock is always released,
 * including when `critical` throws.
 */
export async function withRefreshLock<T>(
  critical: () => Promise<T>,
): Promise<T> {
  const path = getRefreshLockPath();
  await acquire(path);

  try {
    return await critical();
  } finally {
    await unlink(path).catch(() => {});
  }
}
