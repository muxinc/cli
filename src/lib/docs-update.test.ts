import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  downloadAndExtractDocs,
  fetchRemoteDocsVersion,
  getDocsUpdateTargetDir,
  isDocsUpdateAvailable,
  readLocalDocsVersion,
} from './docs-update.ts';

describe('docs-update', () => {
  describe('readLocalDocsVersion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `mux-cli-docs-version-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should read a valid docs-version.json', async () => {
      const version = {
        date: '2026-03-12T06:00:00Z',
        commit: 'abc1234def5678',
      };
      await writeFile(
        join(tempDir, 'docs-version.json'),
        JSON.stringify(version),
      );
      const result = await readLocalDocsVersion(tempDir);
      expect(result).toEqual(version);
    });

    it('should return null when file is missing', async () => {
      const result = await readLocalDocsVersion(tempDir);
      expect(result).toBeNull();
    });

    it('should return null for corrupt JSON', async () => {
      await writeFile(join(tempDir, 'docs-version.json'), 'not valid json!!!');
      const result = await readLocalDocsVersion(tempDir);
      expect(result).toBeNull();
    });
  });

  describe('isDocsUpdateAvailable', () => {
    it('should return true when remote is newer', () => {
      const local = { date: '2026-03-10T00:00:00Z', commit: 'aaa' };
      const remote = { date: '2026-03-12T00:00:00Z', commit: 'bbb' };
      expect(isDocsUpdateAvailable(local, remote)).toBe(true);
    });

    it('should return false when dates are equal', () => {
      const local = { date: '2026-03-12T00:00:00Z', commit: 'aaa' };
      const remote = { date: '2026-03-12T00:00:00Z', commit: 'bbb' };
      expect(isDocsUpdateAvailable(local, remote)).toBe(false);
    });

    it('should return false when local is newer', () => {
      const local = { date: '2026-03-14T00:00:00Z', commit: 'aaa' };
      const remote = { date: '2026-03-12T00:00:00Z', commit: 'bbb' };
      expect(isDocsUpdateAvailable(local, remote)).toBe(false);
    });

    it('should return true when local is null', () => {
      const remote = { date: '2026-03-12T00:00:00Z', commit: 'bbb' };
      expect(isDocsUpdateAvailable(null, remote)).toBe(true);
    });
  });

  describe('fetchRemoteDocsVersion', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return version info on success', async () => {
      const version = {
        date: '2026-03-12T06:00:00Z',
        commit: 'abc1234',
      };
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(version), { status: 200 })),
      ) as unknown as typeof fetch;
      const result = await fetchRemoteDocsVersion();
      expect(result).toEqual(version);
    });

    it('should return null on 404', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('not found', { status: 404 })),
      ) as unknown as typeof fetch;
      const result = await fetchRemoteDocsVersion();
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error('network down')),
      ) as unknown as typeof fetch;
      const result = await fetchRemoteDocsVersion();
      expect(result).toBeNull();
    });
  });

  describe('downloadAndExtractDocs', () => {
    let tempDir: string;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `mux-cli-docs-extract-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
      originalFetch = globalThis.fetch;
    });

    afterEach(async () => {
      globalThis.fetch = originalFetch;
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should download and extract a tarball', async () => {
      // Create a fixture tarball
      const fixtureDir = join(tempDir, 'fixture');
      await mkdir(join(fixtureDir, 'docs', 'guides'), { recursive: true });
      await mkdir(join(fixtureDir, 'skill'), { recursive: true });
      await writeFile(
        join(fixtureDir, 'docs', 'guides', 'test.mdx'),
        '# Test Doc',
      );
      await writeFile(join(fixtureDir, 'skill', 'SKILL.md'), '# Test Skill');
      await writeFile(join(fixtureDir, 'AGENTS.md'), '# Test Agents');
      await writeFile(
        join(fixtureDir, 'docs-version.json'),
        JSON.stringify({
          date: '2026-03-12T06:00:00Z',
          commit: 'abc1234',
        }),
      );

      // Create tarball from fixture
      const tarballPath = join(tempDir, 'mux-docs.tar.gz');
      const proc = Bun.spawn(
        [
          'tar',
          '-czf',
          tarballPath,
          'docs',
          'skill',
          'AGENTS.md',
          'docs-version.json',
        ],
        { cwd: fixtureDir },
      );
      await proc.exited;

      // Read tarball as response body
      const tarballData = await Bun.file(tarballPath).arrayBuffer();
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(tarballData, {
            status: 200,
            headers: { 'Content-Type': 'application/gzip' },
          }),
        ),
      ) as unknown as typeof fetch;

      const targetDir = join(tempDir, 'target');
      await downloadAndExtractDocs(targetDir);

      // Verify extraction
      const testDoc = await Bun.file(
        join(targetDir, 'docs', 'guides', 'test.mdx'),
      ).text();
      expect(testDoc).toBe('# Test Doc');

      const version = JSON.parse(
        await Bun.file(join(targetDir, 'docs-version.json')).text(),
      );
      expect(version.date).toBe('2026-03-12T06:00:00Z');
    });

    it('should throw on fetch failure', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('not found', { status: 404 })),
      ) as unknown as typeof fetch;

      const targetDir = join(tempDir, 'target');
      expect(downloadAndExtractDocs(targetDir)).rejects.toThrow();
    });
  });

  describe('getDocsUpdateTargetDir', () => {
    let originalXdgDataHome: string | undefined;

    beforeEach(() => {
      originalXdgDataHome = process.env.XDG_DATA_HOME;
    });

    afterEach(() => {
      if (originalXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = originalXdgDataHome;
      }
    });

    it('should return currentRootPath for shell installs', () => {
      const result = getDocsUpdateTargetDir('shell', '/home/user/.mux/share');
      expect(result).toBe('/home/user/.mux/share');
    });

    it('should return XDG data dir for homebrew installs', () => {
      process.env.XDG_DATA_HOME = '/tmp/xdg-test';
      const result = getDocsUpdateTargetDir(
        'homebrew',
        '/opt/homebrew/share/mux',
      );
      expect(result).toBe('/tmp/xdg-test/mux');
    });

    it('should return XDG data dir for npm installs', () => {
      process.env.XDG_DATA_HOME = '/tmp/xdg-test';
      const result = getDocsUpdateTargetDir(
        'npm',
        '/usr/local/lib/node_modules/@mux/cli',
      );
      expect(result).toBe('/tmp/xdg-test/mux');
    });

    it('should return XDG data dir for unknown installs', () => {
      process.env.XDG_DATA_HOME = '/tmp/xdg-test';
      const result = getDocsUpdateTargetDir('unknown', '/usr/local/bin');
      expect(result).toBe('/tmp/xdg-test/mux');
    });
  });
});
