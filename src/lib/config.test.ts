import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Config,
  type Environment,
  findEnvironmentByEnvironmentId,
  flagCredential,
  getCurrentEnvironment,
  getEnvironment,
  getEnvironmentAuthType,
  isOAuthEnvironment,
  listEnvironments,
  readConfig,
  removeCredential,
  removeEnvironment,
  setCredential,
  setCurrentEnvironment,
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
            token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
            token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
            token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
            token: { tokenId: 'other_id', tokenSecret: 'other_secret' },
          },
        },
      });

      const env = await getEnvironment('test');
      expect(env).toBeNull();
    });

    it('should return environment when it exists', async () => {
      const testEnv: Environment = {
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
      };

      await setEnvironment('production', testEnv);
      const config = await readConfig();

      expect(config?.defaultEnvironment).toBe('production');
    });

    it('should add environment to existing config', async () => {
      const firstEnv: Environment = {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      };
      const secondEnv: Environment = {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
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
        token: { tokenId: 'original_id', tokenSecret: 'original_secret' },
      };
      const updatedEnv: Environment = {
        token: { tokenId: 'updated_id', tokenSecret: 'updated_secret' },
      };

      await setEnvironment('test', originalEnv);
      await setEnvironment('test', updatedEnv);

      const env = await getEnvironment('test');
      expect(env).toEqual(updatedEnv);
    });
  });

  describe('getCurrentEnvironment', () => {
    it('should return null when no config exists', async () => {
      const result = await getCurrentEnvironment();
      expect(result).toBeNull();
    });

    it('should return null when config has no environments', async () => {
      await writeConfig({ environments: {} });
      const result = await getCurrentEnvironment();
      expect(result).toBeNull();
    });

    it('should return the only environment when only one exists', async () => {
      const testEnv: Environment = {
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
      };

      await setEnvironment('test', testEnv);
      const result = await getCurrentEnvironment();

      expect(result).toEqual({
        name: 'test',
        environment: testEnv,
      });
    });

    it('should return the default environment when multiple exist', async () => {
      const firstEnv: Environment = {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      };
      const secondEnv: Environment = {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
      };

      await setEnvironment('first', firstEnv);
      await setEnvironment('second', secondEnv);
      await setCurrentEnvironment('second');

      const result = await getCurrentEnvironment();

      expect(result).toEqual({
        name: 'second',
        environment: secondEnv,
      });
    });
  });

  describe('setCurrentEnvironment', () => {
    it('should throw error when config does not exist', () => {
      expect(setCurrentEnvironment('test')).rejects.toThrow(
        'No config file exists',
      );
    });

    it('should throw error when environment does not exist', async () => {
      await writeConfig({
        environments: {
          other: {
            token: { tokenId: 'other_id', tokenSecret: 'other_secret' },
          },
        },
      });

      expect(setCurrentEnvironment('test')).rejects.toThrow(
        'Environment "test" does not exist',
      );
    });

    it('should set default environment', async () => {
      const firstEnv: Environment = {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      };
      const secondEnv: Environment = {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
      };

      await setEnvironment('first', firstEnv);
      await setEnvironment('second', secondEnv);
      await setCurrentEnvironment('second');

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
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      });
      await setEnvironment('second', {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
      });
      await setEnvironment('third', {
        token: { tokenId: 'third_id', tokenSecret: 'third_secret' },
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
            token: { tokenId: 'other_id', tokenSecret: 'other_secret' },
          },
        },
      });

      expect(removeEnvironment('test')).rejects.toThrow(
        'Environment "test" does not exist',
      );
    });

    it('should remove environment from config', async () => {
      await setEnvironment('first', {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      });
      await setEnvironment('second', {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
      });

      await removeEnvironment('first');

      const config = await readConfig();
      expect(config?.environments.first).toBeUndefined();
      expect(config?.environments.second).toBeDefined();
    });

    it('should set new default when removing default environment', async () => {
      await setEnvironment('first', {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      });
      await setEnvironment('second', {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
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
        token: { tokenId: 'only_id', tokenSecret: 'only_secret' },
      });

      await removeEnvironment('only');

      const config = await readConfig();
      expect(config?.environments).toEqual({});
      expect(config?.defaultEnvironment).toBeUndefined();
    });

    it('should not change default when removing non-default environment', async () => {
      await setEnvironment('first', {
        token: { tokenId: 'first_id', tokenSecret: 'first_secret' },
      });
      await setEnvironment('second', {
        token: { tokenId: 'second_id', tokenSecret: 'second_secret' },
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
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
            token: { tokenId: 'legacy_id', tokenSecret: 'legacy_secret' },
          },
        },
        defaultEnvironment: 'legacy',
      };

      await writeConfig(legacyConfig);
      const config = await readConfig();
      const env = (await getEnvironment('legacy')) as Environment;

      expect(config).toEqual(legacyConfig);
      expect(env?.token?.tokenId).toBe('legacy_id');
      expect(env?.signingKeyId).toBeUndefined();
    });

    it('should update environment to add signing keys', async () => {
      const envWithoutKeys: Environment = {
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
      };

      await setEnvironment('test', envWithoutKeys);

      const envWithKeys: Environment = {
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
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
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
        signingKeyId: 'signing_key',
        signingPrivateKey:
          '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
      };

      await setEnvironment('test', envWithKeys);

      const envWithoutKeys: Environment = {
        token: { tokenId: 'test_id', tokenSecret: 'test_secret' },
      };

      await setEnvironment('test', envWithoutKeys);
      const env = await getEnvironment('test');

      expect(env?.signingKeyId).toBeUndefined();
      expect(env?.signingPrivateKey).toBeUndefined();
    });
  });
});

describe('Config manager - credential blocks', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;

  const oauthCredential = {
    accessToken: 'access_1',
    refreshToken: 'refresh_1',
    expiresAt: 1_800_000_000,
    scope: 'video:read',
    tokenType: 'Bearer' as const,
  };
  const tokenCredential = { tokenId: 'id_1', tokenSecret: 'secret_1' };

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-oauth-config-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = testConfigDir;
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    await rm(testConfigDir, { recursive: true, force: true });
  });

  describe('reading historical entry shapes', () => {
    it('reads a pre-OAuth flat entry as a token block', async () => {
      // Written by a released version of the CLI: no discriminator, no nesting.
      await Bun.write(
        getConfigPath(),
        JSON.stringify({
          environments: {
            production: {
              tokenId: 'legacy_id',
              tokenSecret: 'legacy_secret',
              environmentId: 'env_legacy',
              signingKeyId: 'key_legacy',
            },
          },
          defaultEnvironment: 'production',
        }),
      );

      const env = await getEnvironment('production');

      expect(env?.token).toEqual({
        tokenId: 'legacy_id',
        tokenSecret: 'legacy_secret',
      });
      expect(env?.environmentId).toBe('env_legacy');
      expect(env?.signingKeyId).toBe('key_legacy');
      expect(getEnvironmentAuthType(env as Environment)).toBe('token');
    });

    it('reads a flat type: oauth entry as an oauth block', async () => {
      await Bun.write(
        getConfigPath(),
        JSON.stringify({
          environments: {
            'acme-production': {
              type: 'oauth',
              accessToken: 'access_1',
              refreshToken: 'refresh_1',
              expiresAt: 1_800_000_000,
              environmentId: 'env_123',
              organizationName: 'Acme Inc',
            },
          },
        }),
      );

      const env = await getEnvironment('acme-production');

      expect(env?.oauth?.accessToken).toBe('access_1');
      expect(env?.organizationName).toBe('Acme Inc');
      expect(isOAuthEnvironment(env as Environment)).toBe(true);
    });
  });

  describe('setCredential', () => {
    it('stores a credential block and environment fields together', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential, {
        environmentId: 'env_123',
        organizationName: 'Acme Inc',
      });

      const env = await getEnvironment('acme-production');
      expect(env?.oauth).toEqual(oauthCredential);
      expect(env?.environmentId).toBe('env_123');
      expect(env?.organizationName).toBe('Acme Inc');
    });

    it('lets one environment hold both credential kinds', async () => {
      await setCredential('acme-production', 'token', tokenCredential, {
        environmentId: 'env_123',
      });
      await setCredential('acme-production', 'oauth', oauthCredential);

      const env = await getEnvironment('acme-production');
      expect(env?.token).toEqual(tokenCredential);
      expect(env?.oauth).toEqual(oauthCredential);
      // OAuth is preferred when both are present.
      expect(getEnvironmentAuthType(env as Environment)).toBe('oauth');
    });

    it('does not disturb environment-bound state when adding a credential', async () => {
      await setCredential('acme-production', 'token', tokenCredential, {
        signingKeyId: 'key_1',
        signingPrivateKey: 'private_1',
        forwardUrl: 'http://localhost:3000/webhooks',
      });
      await setCredential('acme-production', 'oauth', oauthCredential);

      const env = await getEnvironment('acme-production');
      expect(env?.signingKeyId).toBe('key_1');
      expect(env?.signingPrivateKey).toBe('private_1');
      expect(env?.forwardUrl).toBe('http://localhost:3000/webhooks');
    });

    it('replaces the same block rather than merging into it', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);
      await setCredential('acme-production', 'oauth', {
        accessToken: 'access_2',
        refreshToken: 'refresh_2',
        expiresAt: 1_900_000_000,
      });

      const env = await getEnvironment('acme-production');
      expect(env?.oauth?.accessToken).toBe('access_2');
      // The old scope must not survive onto a differently-scoped grant.
      expect(env?.oauth?.scope).toBeUndefined();
    });

    it('sets the first environment as the default', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);

      expect((await readConfig())?.defaultEnvironment).toBe('acme-production');
    });

    it('keeps the restrictive file mode for token material', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);

      expect(statSync(getConfigPath()).mode & 0o777).toBe(0o600);
    });
  });

  describe('flagCredential', () => {
    it('records a failure on one block without touching the other', async () => {
      await setCredential('acme-production', 'token', tokenCredential);
      await setCredential('acme-production', 'oauth', oauthCredential);

      await flagCredential('acme-production', 'oauth', {
        code: 'invalid_grant',
        at: '2026-08-14T00:00:00Z',
      });

      const env = await getEnvironment('acme-production');
      expect(env?.oauth?.lastError?.code).toBe('invalid_grant');
      expect(env?.token?.lastError).toBeUndefined();
      // Flagging is not deleting: the credential is still there to inspect.
      expect(env?.oauth?.refreshToken).toBe('refresh_1');
      // And the healthy token pair becomes the preferred credential.
      expect(getEnvironmentAuthType(env as Environment)).toBe('token');
    });

    it('clears a previous failure when passed null', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);
      await flagCredential('acme-production', 'oauth', {
        code: 'invalid_grant',
        at: 'now',
      });

      await flagCredential('acme-production', 'oauth', null);

      expect(
        (await getEnvironment('acme-production'))?.oauth?.lastError,
      ).toBeUndefined();
    });

    it('is a no-op for an unknown environment', async () => {
      await flagCredential('absent', 'oauth', { code: 'x', at: 'now' });

      expect(await readConfig()).toBeNull();
    });
  });

  describe('removeCredential', () => {
    it('removes one block and keeps the environment and its other credential', async () => {
      await setCredential('acme-production', 'token', tokenCredential, {
        environmentId: 'env_123',
      });
      await setCredential('acme-production', 'oauth', oauthCredential);

      expect(await removeCredential('acme-production', 'oauth')).toBe(true);

      const env = await getEnvironment('acme-production');
      expect(env?.oauth).toBeUndefined();
      expect(env?.token).toEqual(tokenCredential);
      expect(env?.environmentId).toBe('env_123');
    });

    it('reports false when the block is not there', async () => {
      await setCredential('acme-production', 'token', tokenCredential);

      expect(await removeCredential('acme-production', 'oauth')).toBe(false);
    });
  });

  describe('findEnvironmentByEnvironmentId', () => {
    it('finds an entry by Mux environment id regardless of its name', async () => {
      await setCredential('some-name', 'oauth', oauthCredential, {
        environmentId: 'env_123',
      });

      expect((await findEnvironmentByEnvironmentId('env_123'))?.name).toBe(
        'some-name',
      );
    });

    it('returns null when no entry matches', async () => {
      await setCredential('some-name', 'oauth', oauthCredential, {
        environmentId: 'env_123',
      });

      expect(await findEnvironmentByEnvironmentId('env_absent')).toBeNull();
    });

    it('returns null when no config exists', async () => {
      expect(await findEnvironmentByEnvironmentId('env_123')).toBeNull();
    });
  });

  describe('atomic writes', () => {
    it('never leaves a partially written config behind', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);

      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          setCredential(`env-${i}`, 'token', {
            tokenId: `id_${i}`,
            tokenSecret: `secret_${i}`,
          }),
        ),
      );

      // A torn write would surface as invalid JSON here.
      const config = await readConfig();
      expect(config).not.toBeNull();
      expect(config?.environments['acme-production']).toBeDefined();
    });

    it('leaves no temporary files in the config directory', async () => {
      await setCredential('acme-production', 'oauth', oauthCredential);

      expect(readdirSync(`${testConfigDir}/mux`)).toEqual(['config.json']);
    });
  });
});
