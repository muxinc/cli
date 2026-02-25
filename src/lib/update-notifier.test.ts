import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkForUpdate,
  compareSemver,
  detectInstallMethod,
  fetchLatestVersion,
  formatUpdateNotice,
  getUpgradeCommand,
  readUpdateCache,
  type UpdateCache,
  writeUpdateCache,
} from './update-notifier.ts';

describe('update-notifier', () => {
  describe('compareSemver', () => {
    it('should return 0 for equal versions', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    });

    it('should return 1 when a > b (major)', () => {
      expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    });

    it('should return -1 when a < b (major)', () => {
      expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should return 1 when a > b (minor)', () => {
      expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
    });

    it('should return -1 when a < b (minor)', () => {
      expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
    });

    it('should return 1 when a > b (patch)', () => {
      expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
    });

    it('should return -1 when a < b (patch)', () => {
      expect(compareSemver('1.0.1', '1.0.2')).toBe(-1);
    });

    it('should handle multi-digit version numbers', () => {
      expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
      expect(compareSemver('10.0.0', '9.9.9')).toBe(1);
    });
  });

  describe('readUpdateCache / writeUpdateCache', () => {
    let testCacheDir: string;
    let originalXdgCacheHome: string | undefined;

    beforeEach(async () => {
      testCacheDir = join(tmpdir(), `mux-cli-test-cache-${Date.now()}`);
      originalXdgCacheHome = process.env.XDG_CACHE_HOME;
      process.env.XDG_CACHE_HOME = testCacheDir;
    });

    afterEach(async () => {
      if (originalXdgCacheHome === undefined) {
        delete process.env.XDG_CACHE_HOME;
      } else {
        process.env.XDG_CACHE_HOME = originalXdgCacheHome;
      }
      await rm(testCacheDir, { recursive: true, force: true });
    });

    it('should return null when cache file does not exist', async () => {
      const cache = await readUpdateCache();
      expect(cache).toBeNull();
    });

    it('should round-trip cache data', async () => {
      const cache: UpdateCache = {
        latestVersion: '2.0.0',
        lastChecked: Date.now(),
        firstSeenAt: Date.now(),
      };
      await writeUpdateCache(cache);
      const result = await readUpdateCache();
      expect(result).toEqual(cache);
    });

    it('should return null for corrupted cache', async () => {
      const cacheDir = join(testCacheDir, 'mux');
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, 'update-check.json'), 'not json!!!');
      const result = await readUpdateCache();
      expect(result).toBeNull();
    });

    it('should overwrite existing cache', async () => {
      const first: UpdateCache = {
        latestVersion: '1.0.0',
        lastChecked: 1000,
        firstSeenAt: 1000,
      };
      const second: UpdateCache = {
        latestVersion: '2.0.0',
        lastChecked: 2000,
        firstSeenAt: 2000,
      };
      await writeUpdateCache(first);
      await writeUpdateCache(second);
      const result = await readUpdateCache();
      expect(result).toEqual(second);
    });
  });

  describe('fetchLatestVersion', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return version from npm registry', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.5.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const version = await fetchLatestVersion();
      expect(version).toBe('2.5.0');
    });

    it('should return null on network error', async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error('network down')),
      ) as unknown as typeof fetch;
      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });

    it('should return null on non-200 response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('not found', { status: 404 })),
      ) as unknown as typeof fetch;
      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });

    it('should return null on invalid JSON', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('not json', { status: 200 })),
      ) as unknown as typeof fetch;
      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });
  });

  describe('detectInstallMethod', () => {
    it('should detect homebrew from /Cellar/ path', () => {
      expect(
        detectInstallMethod('/opt/homebrew/Cellar/mux/1.0.0/bin/mux'),
      ).toBe('homebrew');
    });

    it('should detect homebrew from /homebrew/ path', () => {
      expect(detectInstallMethod('/opt/homebrew/bin/mux')).toBe('homebrew');
    });

    it('should detect npm from node_modules path', () => {
      expect(
        detectInstallMethod('/usr/local/lib/node_modules/@mux/cli/bin/mux'),
      ).toBe('npm');
    });

    it('should detect shell install from .mux/bin path', () => {
      expect(detectInstallMethod('/home/user/.mux/bin/mux')).toBe('shell');
    });

    it('should return unknown for unrecognized paths', () => {
      expect(detectInstallMethod('/usr/local/bin/mux')).toBe('unknown');
    });
  });

  describe('getUpgradeCommand', () => {
    it('should return brew command for homebrew', () => {
      expect(getUpgradeCommand('homebrew')).toBe('brew upgrade mux');
    });

    it('should return npm command for npm', () => {
      expect(getUpgradeCommand('npm')).toBe('npm install -g @mux/cli@latest');
    });

    it('should return curl command for shell', () => {
      expect(getUpgradeCommand('shell')).toBe(
        'curl -sSf https://raw.githubusercontent.com/muxinc/cli/main/install.sh | sh',
      );
    });

    it('should return npm command for unknown', () => {
      expect(getUpgradeCommand('unknown')).toBe(
        'npm install -g @mux/cli@latest',
      );
    });
  });

  describe('formatUpdateNotice', () => {
    it('should include current and latest versions', () => {
      const notice = formatUpdateNotice('1.0.0', '2.0.0', 'brew upgrade mux');
      expect(notice).toContain('1.0.0');
      expect(notice).toContain('2.0.0');
    });

    it('should include the upgrade command', () => {
      const notice = formatUpdateNotice('1.0.0', '2.0.0', 'brew upgrade mux');
      expect(notice).toContain('brew upgrade mux');
    });

    it('should include "Update available" text', () => {
      const notice = formatUpdateNotice('1.0.0', '2.0.0', 'brew upgrade mux');
      expect(notice).toContain('Update available');
    });
  });

  describe('checkForUpdate', () => {
    let testCacheDir: string;
    let originalXdgCacheHome: string | undefined;
    let originalFetch: typeof globalThis.fetch;
    let originalCI: string | undefined;
    let originalNoUpdateCheck: string | undefined;

    beforeEach(async () => {
      testCacheDir = join(tmpdir(), `mux-cli-test-cache-${Date.now()}`);
      originalXdgCacheHome = process.env.XDG_CACHE_HOME;
      process.env.XDG_CACHE_HOME = testCacheDir;

      originalFetch = globalThis.fetch;
      originalCI = process.env.CI;
      originalNoUpdateCheck = process.env.MUX_NO_UPDATE_CHECK;

      delete process.env.CI;
      delete process.env.MUX_NO_UPDATE_CHECK;
    });

    afterEach(async () => {
      if (originalXdgCacheHome === undefined) {
        delete process.env.XDG_CACHE_HOME;
      } else {
        process.env.XDG_CACHE_HOME = originalXdgCacheHome;
      }

      globalThis.fetch = originalFetch;

      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }

      if (originalNoUpdateCheck === undefined) {
        delete process.env.MUX_NO_UPDATE_CHECK;
      } else {
        process.env.MUX_NO_UPDATE_CHECK = originalNoUpdateCheck;
      }

      await rm(testCacheDir, { recursive: true, force: true });
    });

    it('should return null when CI env var is set', async () => {
      process.env.CI = 'true';
      const result = await checkForUpdate('1.0.0');
      expect(result).toBeNull();
    });

    it('should return null when MUX_NO_UPDATE_CHECK is set', async () => {
      process.env.MUX_NO_UPDATE_CHECK = '1';
      const result = await checkForUpdate('1.0.0');
      expect(result).toBeNull();
    });

    it('should return null when not a TTY', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', { isTTY: false });
      expect(result).toBeNull();
    });

    it('should return notice when newer version is available', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', { isTTY: true });
      expect(result).not.toBeNull();
      expect(result).toContain('2.0.0');
    });

    it('should return null when already on latest version', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', { isTTY: true });
      expect(result).toBeNull();
    });

    it('should use cached version when cache is fresh', async () => {
      const now = Date.now();
      const cache: UpdateCache = {
        latestVersion: '3.0.0',
        lastChecked: now,
        firstSeenAt: now - 49 * 60 * 60 * 1000, // 49 hours ago (past Homebrew delay)
      };
      await writeUpdateCache(cache);

      // fetch should NOT be called
      const fetchMock = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '4.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      globalThis.fetch = fetchMock;

      const result = await checkForUpdate('1.0.0', { isTTY: true });
      expect(result).toContain('3.0.0'); // cached version, not 4.0.0
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should fetch when cache is stale', async () => {
      const staleTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const cache: UpdateCache = {
        latestVersion: '2.0.0',
        lastChecked: staleTime,
        firstSeenAt: staleTime,
      };
      await writeUpdateCache(cache);

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '3.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;

      const result = await checkForUpdate('1.0.0', { isTTY: true });
      expect(result).toContain('3.0.0'); // fetched version
    });

    it('should return null when fetch fails and no cache exists', async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error('network error')),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', { isTTY: true });
      expect(result).toBeNull();
    });

    it('should suppress notification for Homebrew when version is recent', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', {
        isTTY: true,
        execPath: '/opt/homebrew/bin/mux',
      });
      // Version was just discovered (firstSeenAt = now), so Homebrew delay kicks in
      expect(result).toBeNull();
    });

    it('should show notification for Homebrew when version is old enough', async () => {
      const oldTime = Date.now() - 49 * 60 * 60 * 1000; // 49 hours ago
      const cache: UpdateCache = {
        latestVersion: '2.0.0',
        lastChecked: Date.now(),
        firstSeenAt: oldTime,
      };
      await writeUpdateCache(cache);

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;

      const result = await checkForUpdate('1.0.0', {
        isTTY: true,
        execPath: '/opt/homebrew/bin/mux',
      });
      expect(result).not.toBeNull();
      expect(result).toContain('2.0.0');
    });

    it('should not apply Homebrew delay for npm installs', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }),
        ),
      ) as unknown as typeof fetch;
      const result = await checkForUpdate('1.0.0', {
        isTTY: true,
        execPath: '/usr/local/lib/node_modules/@mux/cli/bin/mux',
      });
      // npm install — no delay, should show notice immediately
      expect(result).not.toBeNull();
      expect(result).toContain('2.0.0');
    });
  });
});
