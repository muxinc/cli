import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the library functions that back the command rather than spawning the CLI,
// since the command is a thin wrapper around these functions.
import {
  fetchRemoteDocsVersion,
  getDocsUpdateTargetDir,
  isDocsUpdateAvailable,
  readLocalDocsVersion,
} from '../../lib/docs-update.ts';

describe('docs update command logic', () => {
  let tempDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `mux-cli-docs-cmd-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('--check mode', () => {
    it('should report up-to-date when versions match', async () => {
      const version = {
        date: '2026-03-12T06:00:00Z',
        commit: 'abc1234',
      };
      await writeFile(
        join(tempDir, 'docs-version.json'),
        JSON.stringify(version),
      );

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(version), { status: 200 })),
      ) as unknown as typeof fetch;

      const local = await readLocalDocsVersion(tempDir);
      const remote = await fetchRemoteDocsVersion();
      expect(remote).not.toBeNull();
      expect(
        isDocsUpdateAvailable(local, remote as NonNullable<typeof remote>),
      ).toBe(false);
    });

    it('should report stale when remote is newer', async () => {
      const localVersion = {
        date: '2026-03-10T06:00:00Z',
        commit: 'old1234',
      };
      const remoteVersion = {
        date: '2026-03-12T06:00:00Z',
        commit: 'new5678',
      };
      await writeFile(
        join(tempDir, 'docs-version.json'),
        JSON.stringify(localVersion),
      );

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(remoteVersion), { status: 200 }),
        ),
      ) as unknown as typeof fetch;

      const local = await readLocalDocsVersion(tempDir);
      const remote = await fetchRemoteDocsVersion();
      expect(remote).not.toBeNull();
      expect(
        isDocsUpdateAvailable(local, remote as NonNullable<typeof remote>),
      ).toBe(true);
    });

    it('should report stale when local version is unknown', async () => {
      const remoteVersion = {
        date: '2026-03-12T06:00:00Z',
        commit: 'abc1234',
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(remoteVersion), { status: 200 }),
        ),
      ) as unknown as typeof fetch;

      const local = await readLocalDocsVersion(tempDir);
      const remote = await fetchRemoteDocsVersion();
      expect(local).toBeNull();
      expect(remote).not.toBeNull();
      expect(
        isDocsUpdateAvailable(local, remote as NonNullable<typeof remote>),
      ).toBe(true);
    });
  });

  describe('target directory selection', () => {
    it('should write to current root for shell installs', () => {
      const target = getDocsUpdateTargetDir('shell', '/home/user/.mux/share');
      expect(target).toBe('/home/user/.mux/share');
    });

    it('should write to XDG data dir for homebrew installs', () => {
      const originalXdg = process.env.XDG_DATA_HOME;
      process.env.XDG_DATA_HOME = '/tmp/test-xdg';
      try {
        const target = getDocsUpdateTargetDir(
          'homebrew',
          '/opt/homebrew/share/mux',
        );
        expect(target).toBe('/tmp/test-xdg/mux');
      } finally {
        if (originalXdg === undefined) {
          delete process.env.XDG_DATA_HOME;
        } else {
          process.env.XDG_DATA_HOME = originalXdg;
        }
      }
    });
  });
});
