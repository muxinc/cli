import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEmbeddedDocsPaths } from './embedded-docs.ts';

async function writeFixture(root: string, withAgents = true): Promise<void> {
  await mkdir(join(root, 'skill'), { recursive: true });
  await mkdir(join(root, 'docs', 'guides'), { recursive: true });
  await Bun.write(
    join(root, 'skill', 'SKILL.md'),
    '---\nname: mux-cli\ndescription: test\n---\n',
  );
  await Bun.write(join(root, 'docs', 'guides', 'sample.mdx'), '# test\n');

  if (withAgents) {
    await Bun.write(join(root, 'AGENTS.md'), '# test\n');
  }
}

describe('resolveEmbeddedDocsPaths', () => {
  let tempDir: string;
  let originalMuxShareDir: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-docs-'));
    originalMuxShareDir = process.env.MUX_SHARE_DIR;
    delete process.env.MUX_SHARE_DIR;
  });

  afterEach(async () => {
    if (originalMuxShareDir === undefined) {
      delete process.env.MUX_SHARE_DIR;
    } else {
      process.env.MUX_SHARE_DIR = originalMuxShareDir;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves a repo-style layout from cwd', async () => {
    await writeFixture(tempDir);

    const result = resolveEmbeddedDocsPaths(
      join(tempDir, 'bin', 'mux'),
      tempDir,
    );

    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe(tempDir);
    expect(result?.skillPath).toBe(join(tempDir, 'skill', 'SKILL.md'));
    expect(result?.docsPath).toBe(join(tempDir, 'docs', 'guides'));
    expect(result?.agentsPath).toBe(join(tempDir, 'AGENTS.md'));
  });

  it('resolves shell installs from MUX_SHARE_DIR', async () => {
    const shareDir = join(tempDir, 'custom-share');
    await writeFixture(shareDir);
    process.env.MUX_SHARE_DIR = shareDir;

    const result = resolveEmbeddedDocsPaths(
      join(tempDir, 'bin', 'mux'),
      join(tempDir, 'workspace'),
    );

    expect(result?.rootPath).toBe(shareDir);
    expect(result?.skillPath).toBe(join(shareDir, 'skill', 'SKILL.md'));
  });

  it('resolves Homebrew-style installs from share/mux', async () => {
    const brewPrefix = join(tempDir, 'opt', 'homebrew');
    await writeFixture(join(brewPrefix, 'share', 'mux'));

    const result = resolveEmbeddedDocsPaths(
      join(brewPrefix, 'bin', 'mux'),
      join(tempDir, 'workspace'),
    );

    expect(result?.rootPath).toBe(join(brewPrefix, 'share', 'mux'));
  });

  it('resolves npm installs from the sibling @mux/cli package', async () => {
    const npmRoot = join(tempDir, 'lib', 'node_modules', '@mux', 'cli');
    await writeFixture(npmRoot);

    const execPath = join(
      tempDir,
      'lib',
      'node_modules',
      '@mux',
      'cli-darwin-arm64',
      'mux',
    );

    const result = resolveEmbeddedDocsPaths(
      execPath,
      join(tempDir, 'workspace'),
    );

    expect(result?.rootPath).toBe(npmRoot);
  });

  it('returns null when no embedded docs are present', () => {
    const result = resolveEmbeddedDocsPaths(
      join(tempDir, 'bin', 'mux'),
      join(tempDir, 'workspace'),
    );

    expect(result).toBeNull();
  });

  it('prioritizes XDG data dir over other locations', async () => {
    const xdgDataDir = join(tempDir, 'xdg-data', 'mux');
    const cwdDir = join(tempDir, 'workspace');
    await writeFixture(xdgDataDir);
    await writeFixture(cwdDir);

    const originalXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = join(tempDir, 'xdg-data');

    try {
      const result = resolveEmbeddedDocsPaths(
        join(tempDir, 'bin', 'mux'),
        cwdDir,
      );

      expect(result).not.toBeNull();
      expect(result?.rootPath).toBe(xdgDataDir);
    } finally {
      if (originalXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = originalXdgDataHome;
      }
    }
  });
});
