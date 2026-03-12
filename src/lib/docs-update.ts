import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getCacheDir, getDataDir } from './xdg.ts';

export interface DocsVersionInfo {
  date: string; // ISO-8601
  commit: string; // full SHA
}

const FETCH_TIMEOUT_MS = 3000;
const DOCS_VERSION_URL =
  'https://github.com/muxinc/cli/releases/download/docs-latest/docs-version.json';
const DOCS_TARBALL_URL =
  'https://github.com/muxinc/cli/releases/download/docs-latest/mux-docs.tar.gz';

/**
 * Read the local docs-version.json from the given root path.
 * Returns null if missing or corrupt.
 */
export async function readLocalDocsVersion(
  rootPath: string,
): Promise<DocsVersionInfo | null> {
  const versionPath = join(rootPath, 'docs-version.json');
  if (!existsSync(versionPath)) return null;

  try {
    const content = await readFile(versionPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Fetch the remote docs-version.json from the docs-latest release.
 * Returns null on any failure (network, timeout, bad response).
 */
export async function fetchRemoteDocsVersion(): Promise<DocsVersionInfo | null> {
  try {
    const response = await fetch(DOCS_VERSION_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as DocsVersionInfo;
    return data.date && data.commit ? data : null;
  } catch {
    return null;
  }
}

/**
 * Compare local and remote docs versions.
 * Returns true if remote is newer than local, or if local is null (unknown).
 */
export function isDocsUpdateAvailable(
  local: DocsVersionInfo | null,
  remote: DocsVersionInfo,
): boolean {
  if (!local) return true;
  return remote.date > local.date;
}

/**
 * Download the docs tarball and extract it to targetDir.
 * Uses a temp directory for atomic replacement.
 */
export async function downloadAndExtractDocs(targetDir: string): Promise<void> {
  const response = await fetch(DOCS_TARBALL_URL, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download docs: HTTP ${response.status}`);
  }

  const cacheDir = getCacheDir();
  await mkdir(cacheDir, { recursive: true });

  const tempTarball = join(cacheDir, `mux-docs-${Date.now()}.tar.gz`);
  const tempExtract = join(cacheDir, `mux-docs-extract-${Date.now()}`);

  try {
    // Write tarball to temp file
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(tempTarball, arrayBuffer);

    // Extract to temp directory
    await mkdir(tempExtract, { recursive: true });
    const proc = Bun.spawn(['tar', '-xzf', tempTarball, '-C', tempExtract]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`tar extraction failed with exit code ${exitCode}`);
    }

    // Atomically move into place
    await mkdir(targetDir, { recursive: true });

    // Move extracted contents into target
    for (const entry of ['docs', 'skill', 'AGENTS.md', 'docs-version.json']) {
      const src = join(tempExtract, entry);
      const dest = join(targetDir, entry);
      if (existsSync(src)) {
        await rm(dest, { recursive: true, force: true });
        await rename(src, dest);
      }
    }
  } finally {
    // Clean up temp files
    await rm(tempTarball, { force: true }).catch(() => {});
    await rm(tempExtract, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Determine where to write updated docs based on install method.
 * Shell installs write to the current root; others use XDG data dir.
 */
export function getDocsUpdateTargetDir(
  installMethod: 'homebrew' | 'npm' | 'shell' | 'unknown',
  currentRootPath: string,
): string {
  if (installMethod === 'shell') {
    return currentRootPath;
  }
  return getDataDir();
}
