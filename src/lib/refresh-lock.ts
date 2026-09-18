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

/**
 * Spread added to each poll. Without it every waiter wakes on the same cadence
 * and reaches the staleness check in the same tick, which is the pile-up the
 * break mutex below has to arbitrate.
 */
const POLL_JITTER_MS = 15;

function nextPollInterval(): number {
  return POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS);
}

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

/** A lock file's raw contents, or null when it is missing or unreadable. */
async function readLockFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Decide whether the acquisition described by these contents was abandoned.
 * Malformed contents count as abandoned: leaving one in place would wedge
 * refresh for every future invocation.
 */
function isAbandoned(raw: string): boolean {
  let contents: LockContents;
  try {
    contents = JSON.parse(raw) as LockContents;
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

/**
 * Unlink `path` only if it still holds the contents the caller judged.
 *
 * Re-reading immediately before the unlink is what stops a decision made
 * earlier from deleting a file that has since been replaced. It narrows the
 * window to two syscalls rather than closing it, which is the best a
 * link-based lock can do without a rename-based compare-and-swap.
 */
async function unlinkIfUnchanged(
  path: string,
  expected: string,
): Promise<void> {
  if ((await readLockFile(path)) !== expected) return;
  await unlink(path).catch(() => {});
}

/**
 * Remove a stale lock, serialized so that only one waiter can do it.
 *
 * Deciding a lock is breakable and unlinking it are separate steps, and waiters
 * that crossed the staleness threshold together all arrive here holding the same
 * decision. Unlinking directly would let the second waiter delete the lock the
 * first has since linked, putting both of them on the same rotating refresh
 * token — the invariant this file exists to hold.
 *
 * Serializing through a second lock file leaves a window of its own, but one
 * that spans a few syscalls rather than a network round-trip.
 *
 * Returns whether this call removed the lock. False means another waiter is
 * doing it, or a live holder has taken over; either way the caller should wait
 * rather than spin.
 *
 * Exported for tests: the interleaving it guards against is a few microseconds
 * wide and cannot be reproduced through `withRefreshLock`.
 */
export async function breakStaleLock(path: string): Promise<boolean> {
  const breakPath = `${path}.break`;
  const stagingPath = `${breakPath}.${process.pid}.${randomBytes(4).toString(
    'hex',
  )}`;
  // The mutex carries an owner for the same reason the lock does: every unlink
  // below has to prove it is removing the file it decided about, or it becomes
  // the very check-then-act hazard this function exists to arbitrate.
  const owner = randomBytes(8).toString('hex');
  const mutex = JSON.stringify({
    pid: process.pid,
    acquiredAt: Date.now(),
    owner,
  });

  await writeFile(stagingPath, mutex, { mode: 0o600 });

  try {
    await link(stagingPath, breakPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    // Another waiter is breaking the lock. Clear the mutex only if that waiter
    // died mid-break, so a crash cannot wedge recovery forever, and only if the
    // mutex is still the one just judged — a live waiter may have replaced it.
    const held = await readLockFile(breakPath);
    if (held !== null && isAbandoned(held)) {
      await unlinkIfUnchanged(breakPath, held);
    }
    return false;
  } finally {
    await unlink(stagingPath).catch(() => {});
  }

  try {
    // Re-read under the mutex. Between the caller's decision and this point a
    // new holder may have linked a fresh lock, which must not be deleted.
    const raw = await readLockFile(path);
    if (raw === null) {
      // Already gone: there is nothing to break, and the caller should retry
      // its link. Unlinking here would race every contender doing exactly
      // that — the mutex serializes breakers, not acquirers — and delete the
      // lock of whichever one had just linked.
      return true;
    }
    if (!isAbandoned(raw)) {
      return false;
    }
    // Only the file that was judged abandoned may be removed. A different one
    // at the same path is a live acquisition.
    if ((await readLockFile(path)) !== raw) {
      return false;
    }
    try {
      await unlink(path);
    } catch (error) {
      // Already gone is the outcome that was wanted. Anything else — a
      // read-only volume, an immutable file — is a failure the caller has to
      // hear about, or it will spin on a lock it can never remove.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return false;
      }
    }
    return true;
  } finally {
    await unlinkIfUnchanged(breakPath, mutex);
  }
}

export interface RefreshLockOptions {
  /** Override how long to wait for another holder. Intended for tests. */
  timeoutMs?: number;
}

function acquireTimeout(path: string, timeoutMs: number): Error {
  return new Error(
    `Timed out after ${Math.round(
      timeoutMs / 1000,
    )}s waiting for another mux process to finish refreshing credentials. If no other mux command is running, delete ${path} and try again.`,
  );
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

    const held = await readLockFile(path);
    if (held === null) {
      // Released since the link attempt above. This is the ordinary hand-off
      // between a holder and its waiters, not a recovery: retry the link and
      // stay out of the break path, which exists to delete things.
      continue;
    }

    if (isAbandoned(held)) {
      // A break clears the way for the link attempt at the top of the next
      // iteration, so retry straight away rather than waiting out a poll.
      if (await breakStaleLock(path)) continue;

      // Someone else is recovering, a live holder has taken over, or the lock
      // cannot be removed at all. Let that settle instead of spinning on a
      // decision that has already been overtaken.
      await Bun.sleep(nextPollInterval());
      if (Date.now() > deadline) {
        throw acquireTimeout(path, timeoutMs);
      }
      continue;
    }

    if (Date.now() > deadline) {
      // The holder is alive and still working: a lock this young cannot be
      // abandoned, since STALE_AFTER_MS would have broken it first. Failing is
      // the safe outcome — deleting a live holder's lock would put two
      // processes on the same rotating refresh token.
      throw acquireTimeout(path, timeoutMs);
    }

    await Bun.sleep(nextPollInterval());
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
