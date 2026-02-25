import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getCacheDir,
  getConfigDir,
  getConfigPath,
  getUpdateCachePath,
} from './xdg.ts';

describe('XDG config utilities', () => {
  let originalXdgConfigHome: string | undefined;
  let originalXdgCacheHome: string | undefined;

  beforeEach(() => {
    // Save original env vars
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalXdgCacheHome = process.env.XDG_CACHE_HOME;
  });

  afterEach(() => {
    // Restore original XDG_CONFIG_HOME
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }

    // Restore original XDG_CACHE_HOME
    if (originalXdgCacheHome === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    }
  });

  describe('getConfigDir', () => {
    it('should return XDG_CONFIG_HOME/mux when XDG_CONFIG_HOME is set', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      const result = getConfigDir();
      expect(result).toBe('/custom/config/mux');
    });

    it('should return ~/.config/mux when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      const result = getConfigDir();
      const expected = join(homedir(), '.config', 'mux');
      expect(result).toBe(expected);
    });

    it('should handle XDG_CONFIG_HOME with trailing slash', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config/';
      const result = getConfigDir();
      // join will handle the trailing slash correctly
      expect(result).toContain('mux');
      expect(result).toContain('/custom/config');
    });
  });

  describe('getConfigPath', () => {
    it('should return full path to config.json', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      const result = getConfigPath();
      expect(result).toBe('/custom/config/mux/config.json');
    });

    it('should return ~/.config/mux/config.json when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      const result = getConfigPath();
      const expected = join(homedir(), '.config', 'mux', 'config.json');
      expect(result).toBe(expected);
    });
  });

  describe('getCacheDir', () => {
    it('should return XDG_CACHE_HOME/mux when XDG_CACHE_HOME is set', () => {
      process.env.XDG_CACHE_HOME = '/custom/cache';
      const result = getCacheDir();
      expect(result).toBe('/custom/cache/mux');
    });

    it('should return ~/.cache/mux when XDG_CACHE_HOME is not set', () => {
      delete process.env.XDG_CACHE_HOME;
      const result = getCacheDir();
      const expected = join(homedir(), '.cache', 'mux');
      expect(result).toBe(expected);
    });

    it('should handle XDG_CACHE_HOME with trailing slash', () => {
      process.env.XDG_CACHE_HOME = '/custom/cache/';
      const result = getCacheDir();
      expect(result).toContain('mux');
      expect(result).toContain('/custom/cache');
    });
  });

  describe('getUpdateCachePath', () => {
    it('should return full path to update-check.json', () => {
      process.env.XDG_CACHE_HOME = '/custom/cache';
      const result = getUpdateCachePath();
      expect(result).toBe('/custom/cache/mux/update-check.json');
    });

    it('should return ~/.cache/mux/update-check.json when XDG_CACHE_HOME is not set', () => {
      delete process.env.XDG_CACHE_HOME;
      const result = getUpdateCachePath();
      const expected = join(homedir(), '.cache', 'mux', 'update-check.json');
      expect(result).toBe(expected);
    });
  });
});
