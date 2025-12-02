import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getConfigDir, getConfigPath } from './xdg.ts';

describe('XDG config utilities', () => {
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    // Save original XDG_CONFIG_HOME
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    // Restore original XDG_CONFIG_HOME
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
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
});
