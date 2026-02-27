import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { colors } from '@cliffy/ansi/colors';
import { getUpdateCachePath } from './xdg.ts';

export interface UpdateCache {
  latestVersion: string;
  lastChecked: number;
  firstSeenAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOMEBREW_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours
const FETCH_TIMEOUT_MS = 3000;
const REGISTRY_URL = 'https://registry.npmjs.org/@mux/cli/latest';

/**
 * Compare two semver strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Read the update check cache file. Returns null if missing or corrupted.
 */
export async function readUpdateCache(): Promise<UpdateCache | null> {
  const cachePath = getUpdateCachePath();

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = await readFile(cachePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write the update check cache file, creating the directory if needed.
 */
export async function writeUpdateCache(cache: UpdateCache): Promise<void> {
  const cachePath = getUpdateCachePath();
  const cacheDir = dirname(cachePath);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Fetch the latest version from the npm registry.
 * Returns null on any failure (network, timeout, bad response).
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Detect how the CLI was installed based on the executable path.
 */
export function detectInstallMethod(
  execPath?: string,
): 'homebrew' | 'npm' | 'shell' | 'unknown' {
  const p = execPath ?? process.argv[0];
  if (p.includes('/Cellar/') || p.includes('/homebrew/')) return 'homebrew';
  if (p.includes('node_modules')) return 'npm';
  if (p.includes('.mux/bin')) return 'shell';
  return 'unknown';
}

/**
 * Get the appropriate upgrade command for the install method.
 */
export function getUpgradeCommand(
  method: 'homebrew' | 'npm' | 'shell' | 'unknown',
): string {
  switch (method) {
    case 'homebrew':
      return 'brew upgrade mux';
    case 'npm':
      return 'npm install -g @mux/cli@latest';
    case 'shell':
      return 'curl -sSf https://raw.githubusercontent.com/muxinc/cli/main/install.sh | sh';
    default:
      return 'npm install -g @mux/cli@latest';
  }
}

/**
 * Format the update notice for display.
 */
export function formatUpdateNotice(
  current: string,
  latest: string,
  command: string,
): string {
  return `\n${colors.yellow(`Update available: ${current} → ${latest}`)}\nRun \`${colors.cyan(command)}\` to update\n`;
}

export interface CheckForUpdateOptions {
  isTTY?: boolean;
  execPath?: string;
}

/**
 * Check for an available update. Returns a formatted notice string
 * if an update is available, or null otherwise.
 *
 * Skipped when:
 * - stderr is not a TTY (piped output)
 * - CI env var is set
 * - MUX_NO_UPDATE_CHECK env var is set
 */
export async function checkForUpdate(
  currentVersion: string,
  options?: CheckForUpdateOptions,
): Promise<string | null> {
  // Skip in non-interactive environments
  if (process.env.CI) return null;
  if (process.env.MUX_NO_UPDATE_CHECK) return null;

  const isTTY = options?.isTTY ?? process.stderr.isTTY;
  if (!isTTY) return null;

  // Check cache first
  const cache = await readUpdateCache();
  let latestVersion: string | null = null;
  let firstSeenAt: number = Date.now();

  if (cache && Date.now() - cache.lastChecked < CACHE_TTL_MS) {
    // Cache is fresh
    latestVersion = cache.latestVersion;
    firstSeenAt = cache.firstSeenAt;
  } else {
    // Cache is stale or missing — fetch from registry
    latestVersion = await fetchLatestVersion();
    if (latestVersion) {
      // Preserve firstSeenAt if same version, otherwise record new discovery time
      firstSeenAt =
        cache?.latestVersion === latestVersion ? cache.firstSeenAt : Date.now();
      await writeUpdateCache({
        latestVersion,
        lastChecked: Date.now(),
        firstSeenAt,
      }).catch(() => {}); // best-effort cache write
    }
  }

  if (!latestVersion) return null;
  if (compareSemver(latestVersion, currentVersion) <= 0) return null;

  const method = detectInstallMethod(options?.execPath);

  // Give Homebrew formulae time to update before notifying
  if (method === 'homebrew' && Date.now() - firstSeenAt < HOMEBREW_DELAY_MS) {
    return null;
  }

  const command = getUpgradeCommand(method);
  return formatUpdateNotice(currentVersion, latestVersion, command);
}
