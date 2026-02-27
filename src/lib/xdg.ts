import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Get the XDG config directory path for Mux CLI
 * Follows XDG Base Directory specification
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const baseDir = xdgConfigHome || join(homedir(), '.config');
  return join(baseDir, 'mux');
}

/**
 * Get the full path to the config file
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the XDG cache directory path for Mux CLI
 * Follows XDG Base Directory specification
 */
export function getCacheDir(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const baseDir = xdgCacheHome || join(homedir(), '.cache');
  return join(baseDir, 'mux');
}

/**
 * Get the full path to the update check cache file
 */
export function getUpdateCachePath(): string {
  return join(getCacheDir(), 'update-check.json');
}
