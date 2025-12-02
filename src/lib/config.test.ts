import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Config,
  type Environment,
  getDefaultEnvironment,
  getEnvironment,
  listEnvironments,
  readConfig,
  removeEnvironment,
  setDefaultEnvironment,
  setEnvironment,
  writeConfig,
} from './config.ts';
import { getConfigPath } from './xdg.ts';

describe('Config manager', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));

    // Save and override XDG_CONFIG_HOME to use our test directory
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = testConfigDir;
  });

  afterEach(async () => {
    // Restore original XDG_CONFIG_HOME
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }

    // Clean up test directory
    await rm(testConfigDir, { recursive: true, force: true });
  });

  describe('readConfig', () => {
    it('should return null when config file does not exist', async () => {
      const config = await readConfig();
      expect(config).toBeNull();
    });

    it('should read and parse config file', async () => {
      const testConfig: Config = {
        environments: {
          test: {
            tokenId: 'test_id',
            tokenSecret: 'test_secret',
          },
        },
        defaultEnvironment: 'test',
      };

      await writeConfig(testConfig);
      const config = await readConfig();

      expect(config).toEqual(testConfig);
    });

    it('should throw error for invalid JSON', async () => {
      const configPath = getConfigPath();
      await Bun.write(configPath, 'invalid json {');

      await expect(readConfig()).rejects.toThrow('Failed to read config');
    });
  });

  describe('writeConfig', () => {
    it('should create config directory if it does not exist', async () => {
      const testConfig: Config = {
        environments: {
          test: {
            tokenId: 'test_id',
            tokenSecret: 'test_secret',
          },
        },
      };

      await writeConfig(testConfig);
      const config = await readConfig();

      expect(config).toEqual(testConfig);
    });

    it('should write config with proper formatting', async () => {
      const testConfig: Config = {
        environments: {
          test: {
            tokenId: 'test_id',
            tokenSecret: 'test_secret',
          },
        },
        defaultEnvironment: 'test',
      };

      await writeConfig(testConfig);
      const configPath = getConfigPath();
      const content = await Bun.file(configPath).text();

      // Should be pretty-printed JSON
      expect(content).toContain('  ');
      expect(content).toContain('\n');
      expect(JSON.parse(content)).toEqual(testConfig);
    });
  });

  describe('getEnvironment', () => {
    it('should return null when config does not exist', async () => {
      const env = await getEnvironment('test');
      expect(env).toBeNull();
    });

    it('should return null when environment does not exist', async () => {
      await writeConfig({
        environments: {
          other: {
            tokenId: 'other_id',
            tokenSecret: 'other_secret',
          },
        },
      });

      const env = await getEnvironment('test');
      expect(env).toBeNull();
    });

    it('should return environment when it exists', async () => {
      const testEnv: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await writeConfig({
        environments: {
          test: testEnv,
        },
      });

      const env = await getEnvironment('test');
      expect(env).toEqual(testEnv);
    });
  });

  describe('setEnvironment', () => {
    it('should create new config with single environment', async () => {
      const testEnv: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('test', testEnv);
      const config = await readConfig();

      expect(config).toEqual({
        environments: {
          test: testEnv,
        },
        defaultEnvironment: 'test',
      });
    });

    it('should set first environment as default', async () => {
      const testEnv: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('production', testEnv);
      const config = await readConfig();

      expect(config?.defaultEnvironment).toBe('production');
    });

    it('should add environment to existing config', async () => {
      const firstEnv: Environment = {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      };
      const secondEnv: Environment = {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      };

      await setEnvironment('first', firstEnv);
      await setEnvironment('second', secondEnv);

      const config = await readConfig();

      expect(config?.environments.first).toEqual(firstEnv);
      expect(config?.environments.second).toEqual(secondEnv);
      expect(config?.defaultEnvironment).toBe('first');
    });

    it('should update existing environment', async () => {
      const originalEnv: Environment = {
        tokenId: 'original_id',
        tokenSecret: 'original_secret',
      };
      const updatedEnv: Environment = {
        tokenId: 'updated_id',
        tokenSecret: 'updated_secret',
      };

      await setEnvironment('test', originalEnv);
      await setEnvironment('test', updatedEnv);

      const env = await getEnvironment('test');
      expect(env).toEqual(updatedEnv);
    });
  });

  describe('getDefaultEnvironment', () => {
    it('should return null when no config exists', async () => {
      const result = await getDefaultEnvironment();
      expect(result).toBeNull();
    });

    it('should return null when config has no environments', async () => {
      await writeConfig({ environments: {} });
      const result = await getDefaultEnvironment();
      expect(result).toBeNull();
    });

    it('should return the only environment when only one exists', async () => {
      const testEnv: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('test', testEnv);
      const result = await getDefaultEnvironment();

      expect(result).toEqual({
        name: 'test',
        environment: testEnv,
      });
    });

    it('should return the default environment when multiple exist', async () => {
      const firstEnv: Environment = {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      };
      const secondEnv: Environment = {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      };

      await setEnvironment('first', firstEnv);
      await setEnvironment('second', secondEnv);
      await setDefaultEnvironment('second');

      const result = await getDefaultEnvironment();

      expect(result).toEqual({
        name: 'second',
        environment: secondEnv,
      });
    });
  });

  describe('setDefaultEnvironment', () => {
    it('should throw error when config does not exist', () => {
      expect(setDefaultEnvironment('test')).rejects.toThrow(
        'No config file exists',
      );
    });

    it('should throw error when environment does not exist', async () => {
      await writeConfig({
        environments: {
          other: {
            tokenId: 'other_id',
            tokenSecret: 'other_secret',
          },
        },
      });

      expect(setDefaultEnvironment('test')).rejects.toThrow(
        'Environment "test" does not exist',
      );
    });

    it('should set default environment', async () => {
      const firstEnv: Environment = {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      };
      const secondEnv: Environment = {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      };

      await setEnvironment('first', firstEnv);
      await setEnvironment('second', secondEnv);
      await setDefaultEnvironment('second');

      const config = await readConfig();
      expect(config?.defaultEnvironment).toBe('second');
    });
  });

  describe('listEnvironments', () => {
    it('should return empty array when no config exists', async () => {
      const result = await listEnvironments();
      expect(result).toEqual([]);
    });

    it('should return array of environment names', async () => {
      await setEnvironment('first', {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      });
      await setEnvironment('second', {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      });
      await setEnvironment('third', {
        tokenId: 'third_id',
        tokenSecret: 'third_secret',
      });

      const result = await listEnvironments();
      expect(result).toContain('first');
      expect(result).toContain('second');
      expect(result).toContain('third');
      expect(result.length).toBe(3);
    });
  });

  describe('removeEnvironment', () => {
    it('should throw error when config does not exist', () => {
      expect(removeEnvironment('test')).rejects.toThrow(
        'No config file exists',
      );
    });

    it('should throw error when environment does not exist', async () => {
      await writeConfig({
        environments: {
          other: {
            tokenId: 'other_id',
            tokenSecret: 'other_secret',
          },
        },
      });

      expect(removeEnvironment('test')).rejects.toThrow(
        'Environment "test" does not exist',
      );
    });

    it('should remove environment from config', async () => {
      await setEnvironment('first', {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      });
      await setEnvironment('second', {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      });

      await removeEnvironment('first');

      const config = await readConfig();
      expect(config?.environments.first).toBeUndefined();
      expect(config?.environments.second).toBeDefined();
    });

    it('should set new default when removing default environment', async () => {
      await setEnvironment('first', {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      });
      await setEnvironment('second', {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      });

      // first is the default
      const configBefore = await readConfig();
      expect(configBefore?.defaultEnvironment).toBe('first');

      // Remove the default
      await removeEnvironment('first');

      // Should pick a new default
      const configAfter = await readConfig();
      expect(configAfter?.defaultEnvironment).toBe('second');
    });

    it('should set default to undefined when removing last environment', async () => {
      await setEnvironment('only', {
        tokenId: 'only_id',
        tokenSecret: 'only_secret',
      });

      await removeEnvironment('only');

      const config = await readConfig();
      expect(config?.environments).toEqual({});
      expect(config?.defaultEnvironment).toBeUndefined();
    });

    it('should not change default when removing non-default environment', async () => {
      await setEnvironment('first', {
        tokenId: 'first_id',
        tokenSecret: 'first_secret',
      });
      await setEnvironment('second', {
        tokenId: 'second_id',
        tokenSecret: 'second_secret',
      });

      // first is the default
      const configBefore = await readConfig();
      expect(configBefore?.defaultEnvironment).toBe('first');

      // Remove non-default
      await removeEnvironment('second');

      // Default should stay the same
      const configAfter = await readConfig();
      expect(configAfter?.defaultEnvironment).toBe('first');
    });
  });

  describe('Environment with signing keys', () => {
    it('should store and retrieve environment with signing keys', async () => {
      const envWithSigningKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
        signingKeyId: 'signing_key_id',
        signingPrivateKey:
          '-----BEGIN RSA PRIVATE KEY-----\ntest_key\n-----END RSA PRIVATE KEY-----',
      };

      await setEnvironment('production', envWithSigningKeys);
      const env = await getEnvironment('production');

      expect(env).toEqual(envWithSigningKeys);
      expect(env?.signingKeyId).toBe('signing_key_id');
      expect(env?.signingPrivateKey).toContain('BEGIN RSA PRIVATE KEY');
    });

    it('should support environments without signing keys', async () => {
      const envWithoutSigningKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('dev', envWithoutSigningKeys);
      const env = await getEnvironment('dev');

      expect(env).toEqual(envWithoutSigningKeys);
      expect(env?.signingKeyId).toBeUndefined();
      expect(env?.signingPrivateKey).toBeUndefined();
    });

    it('should maintain backward compatibility with configs without signing keys', async () => {
      const legacyConfig: Config = {
        environments: {
          legacy: {
            tokenId: 'legacy_id',
            tokenSecret: 'legacy_secret',
          },
        },
        defaultEnvironment: 'legacy',
      };

      await writeConfig(legacyConfig);
      const config = await readConfig();
      const env = await getEnvironment('legacy');

      expect(config).toEqual(legacyConfig);
      expect(env?.tokenId).toBe('legacy_id');
      expect(env?.signingKeyId).toBeUndefined();
    });

    it('should update environment to add signing keys', async () => {
      const envWithoutKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('test', envWithoutKeys);

      const envWithKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
        signingKeyId: 'new_signing_key',
        signingPrivateKey:
          '-----BEGIN RSA PRIVATE KEY-----\nkey_data\n-----END RSA PRIVATE KEY-----',
      };

      await setEnvironment('test', envWithKeys);
      const env = await getEnvironment('test');

      expect(env?.signingKeyId).toBe('new_signing_key');
      expect(env?.signingPrivateKey).toContain('BEGIN RSA PRIVATE KEY');
    });

    it('should allow removing signing keys from environment', async () => {
      const envWithKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
        signingKeyId: 'signing_key',
        signingPrivateKey:
          '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
      };

      await setEnvironment('test', envWithKeys);

      const envWithoutKeys: Environment = {
        tokenId: 'test_id',
        tokenSecret: 'test_secret',
      };

      await setEnvironment('test', envWithoutKeys);
      const env = await getEnvironment('test');

      expect(env?.signingKeyId).toBeUndefined();
      expect(env?.signingPrivateKey).toBeUndefined();
    });
  });
});
