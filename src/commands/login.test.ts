import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  spyOn,
} from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnvironment, setEnvironment } from '../lib/config.ts';
import { setAgentMode } from '../lib/context.ts';
import { credentialsFromEnv, loginCommand, parseEnvFile } from './login.ts';

describe('Login command - parseEnvFile', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await mkdtemp(join(tmpdir(), 'mux-cli-login-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it('should throw error when file does not exist', async () => {
    const nonExistentPath = join(testDir, 'does-not-exist.env');
    expect(parseEnvFile(nonExistentPath)).rejects.toThrow('File not found');
  });

  it('should parse basic MUX_TOKEN_ID and MUX_TOKEN_SECRET', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test_id_123
MUX_TOKEN_SECRET=test_secret_456`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should handle double-quoted values', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID="test_id_123"
MUX_TOKEN_SECRET="test_secret_456"`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should handle single-quoted values', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID='test_id_123'
MUX_TOKEN_SECRET='test_secret_456'`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should skip comment lines', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `# This is a comment
MUX_TOKEN_ID=test_id_123
# Another comment
MUX_TOKEN_SECRET=test_secret_456`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should skip empty lines', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test_id_123

MUX_TOKEN_SECRET=test_secret_456

`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should handle spaces around equals sign', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID = test_id_123
MUX_TOKEN_SECRET = test_secret_456`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should parse MUX_SIGNING_KEY and MUX_PRIVATE_KEY', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test_id_123
MUX_TOKEN_SECRET=test_secret_456
MUX_SIGNING_KEY=signing_key_id
MUX_PRIVATE_KEY=private_key_base64`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_SIGNING_KEY).toBe('signing_key_id');
    expect(result.MUX_PRIVATE_KEY).toBe('private_key_base64');
  });

  it('should parse MUX_BASE_URL', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test_id_123
MUX_TOKEN_SECRET=test_secret_456
MUX_BASE_URL=https://api.example.com`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
    expect(result.MUX_BASE_URL).toBe('https://api.example.com');
  });

  it('should ignore other environment variables', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `OTHER_VAR=other_value
MUX_TOKEN_ID=test_id_123
ANOTHER_VAR=another_value
MUX_TOKEN_SECRET=test_secret_456
YET_ANOTHER=yet_another`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('should return empty object when no Mux variables present', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `OTHER_VAR=other_value
ANOTHER_VAR=another_value`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBeUndefined();
    expect(result.MUX_TOKEN_SECRET).toBeUndefined();
  });

  it('should handle values with special characters', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test-id_123.abc
MUX_TOKEN_SECRET=secret!@#$%^&*()`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test-id_123.abc');
    expect(result.MUX_TOKEN_SECRET).toBe('secret!@#$%^&*()');
  });

  it('should handle values with equals signs in them', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `MUX_TOKEN_ID=test_id_123
MUX_TOKEN_SECRET=secret=with=equals`,
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('secret=with=equals');
  });

  it('should handle only MUX_TOKEN_ID present', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(envPath, `MUX_TOKEN_ID=test_id_123`);

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBeUndefined();
  });

  it('should handle only MUX_TOKEN_SECRET present', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(envPath, `MUX_TOKEN_SECRET=test_secret_456`);

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBeUndefined();
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should handle empty file', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(envPath, '');

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBeUndefined();
    expect(result.MUX_TOKEN_SECRET).toBeUndefined();
  });
});

describe('Login command - credentialsFromEnv', () => {
  it('returns credentials when both token vars are present', () => {
    const result = credentialsFromEnv({
      MUX_TOKEN_ID: 'env_id',
      MUX_TOKEN_SECRET: 'env_secret',
    });

    expect(result).not.toBeNull();
    expect(result?.MUX_TOKEN_ID).toBe('env_id');
    expect(result?.MUX_TOKEN_SECRET).toBe('env_secret');
  });

  it('includes MUX_BASE_URL when present', () => {
    const result = credentialsFromEnv({
      MUX_TOKEN_ID: 'env_id',
      MUX_TOKEN_SECRET: 'env_secret',
      MUX_BASE_URL: 'https://api.example.com',
    });

    expect(result?.MUX_BASE_URL).toBe('https://api.example.com');
  });

  it('returns null when MUX_TOKEN_ID is missing', () => {
    expect(credentialsFromEnv({ MUX_TOKEN_SECRET: 'env_secret' })).toBeNull();
  });

  it('returns null when MUX_TOKEN_SECRET is missing', () => {
    expect(credentialsFromEnv({ MUX_TOKEN_ID: 'env_id' })).toBeNull();
  });

  it('returns null when either var is an empty string', () => {
    expect(
      credentialsFromEnv({ MUX_TOKEN_ID: '', MUX_TOKEN_SECRET: 'secret' }),
    ).toBeNull();
    expect(
      credentialsFromEnv({ MUX_TOKEN_ID: 'id', MUX_TOKEN_SECRET: '' }),
    ).toBeNull();
  });

  it('defaults to process.env when no argument is given', () => {
    const originalId = process.env.MUX_TOKEN_ID;
    const originalSecret = process.env.MUX_TOKEN_SECRET;
    process.env.MUX_TOKEN_ID = 'process_env_id';
    process.env.MUX_TOKEN_SECRET = 'process_env_secret';

    try {
      const result = credentialsFromEnv();
      expect(result?.MUX_TOKEN_ID).toBe('process_env_id');
      expect(result?.MUX_TOKEN_SECRET).toBe('process_env_secret');
    } finally {
      if (originalId === undefined) delete process.env.MUX_TOKEN_ID;
      else process.env.MUX_TOKEN_ID = originalId;
      if (originalSecret === undefined) delete process.env.MUX_TOKEN_SECRET;
      else process.env.MUX_TOKEN_SECRET = originalSecret;
    }
  });
});

describe('Login command - action', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalTokenId: string | undefined;
  let originalTokenSecret: string | undefined;
  let logSpy: Mock<typeof console.log>;
  let errorSpy: Mock<typeof console.error>;
  let exitSpy: Mock<typeof process.exit>;
  let fetchSpy: Mock<typeof fetch>;

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalTokenId = process.env.MUX_TOKEN_ID;
    originalTokenSecret = process.env.MUX_TOKEN_SECRET;
    process.env.XDG_CONFIG_HOME = testConfigDir;
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;

    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    // Mock the credential validation call (/system/v1/whoami)
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(
          JSON.stringify({ data: { environment_id: 'env_mock_123' } }),
          { status: 200 },
        )) as unknown as typeof fetch,
    );
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (originalTokenId === undefined) delete process.env.MUX_TOKEN_ID;
    else process.env.MUX_TOKEN_ID = originalTokenId;
    if (originalTokenSecret === undefined) delete process.env.MUX_TOKEN_SECRET;
    else process.env.MUX_TOKEN_SECRET = originalTokenSecret;
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    exitSpy?.mockRestore();
    fetchSpy?.mockRestore();
    setAgentMode(false);
    await rm(testConfigDir, { recursive: true, force: true });
  });

  it('has a --json option', () => {
    const opt = loginCommand.getOptions().find((o) => o.name === 'json');
    expect(opt).toBeDefined();
  });

  it('uses MUX_TOKEN_ID/MUX_TOKEN_SECRET from the environment without prompting', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';

    await loginCommand.parse([]);

    const saved = await getEnvironment('default');
    expect(saved?.tokenId).toBe('env_id');
    expect(saved?.tokenSecret).toBe('env_secret');
  });

  it('prefers --env-file over environment variables', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret',
    );

    await loginCommand.parse(['--env-file', envPath]);

    const saved = await getEnvironment('default');
    expect(saved?.tokenId).toBe('file_id');
    expect(saved?.tokenSecret).toBe('file_secret');
  });

  it('outputs machine-readable JSON with --json', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';

    await loginCommand.parse(['--json']);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.environment).toBe('default');
    expect(parsed.config_path).toBeDefined();
  });

  it('accepts --json in agent mode without erroring (regression: --agent used to break login)', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';
    setAgentMode(true);

    await loginCommand.parse([]);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(JSON.parse(output).success).toBe(true);
  });

  it('fails fast with a JSON error on --json when no credentials are available', async () => {
    try {
      await loginCommand.parse(['--json']);
    } catch (_error) {
      // handleCommandError exits; the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(parsed.error).toMatch(/MUX_TOKEN_ID and MUX_TOKEN_SECRET/);
  });

  it('fails fast with a JSON error in agent mode instead of prompting when no credentials are available', async () => {
    setAgentMode(true);

    try {
      await loginCommand.parse([]);
    } catch (_error) {
      // handleCommandError exits; the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(parsed.error).toMatch(/Interactive login is not available/);
  });

  it('reports credential validation failures as JSON in agent mode', async () => {
    process.env.MUX_TOKEN_ID = 'bad_id';
    process.env.MUX_TOKEN_SECRET = 'bad_secret';
    setAgentMode(true);
    fetchSpy.mockImplementation(
      (async () =>
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
        })) as unknown as typeof fetch,
    );

    try {
      await loginCommand.parse([]);
    } catch (_error) {
      // handleCommandError exits; the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(parsed.error).toBeDefined();
  });

  it('keeps human-readable errors when not in JSON or agent mode', async () => {
    const missingFile = join(testConfigDir, 'missing.env');

    try {
      await loginCommand.parse(['--env-file', missingFile]);
    } catch (_error) {
      // handleCommandError exits; the mocked process.exit throws to halt parse
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toMatch(/^Error: /);
    expect(message).toMatch(/File not found/);
  });

  it('respects --name when logging in from environment variables', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';

    await loginCommand.parse(['--name', 'staging']);

    const saved = await getEnvironment('staging');
    expect(saved?.tokenId).toBe('env_id');
  });

  it('saves signing keys from the env file when both are present', async () => {
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret\nMUX_SIGNING_KEY=key_abc\nMUX_PRIVATE_KEY=private_base64',
    );

    await loginCommand.parse(['--env-file', envPath]);

    const saved = await getEnvironment('default');
    expect(saved?.signingKeyId).toBe('key_abc');
    expect(saved?.signingPrivateKey).toBe('private_base64');
  });

  it('prefers the env file MUX_BASE_URL over the shell MUX_BASE_URL', async () => {
    const originalBaseUrl = process.env.MUX_BASE_URL;
    process.env.MUX_BASE_URL = 'https://shell.example.com';
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret\nMUX_BASE_URL=https://file.example.com',
    );

    try {
      await loginCommand.parse(['--env-file', envPath]);
    } finally {
      if (originalBaseUrl === undefined) delete process.env.MUX_BASE_URL;
      else process.env.MUX_BASE_URL = originalBaseUrl;
    }

    const saved = await getEnvironment('default');
    expect(saved?.baseUrl).toBe('https://file.example.com');
    const validationUrl = String(fetchSpy.mock.calls[0][0]);
    expect(validationUrl.startsWith('https://file.example.com')).toBe(true);
  });

  it('falls back to the shell MUX_BASE_URL when the env file sets none', async () => {
    const originalBaseUrl = process.env.MUX_BASE_URL;
    process.env.MUX_BASE_URL = 'https://shell.example.com';
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret',
    );

    try {
      await loginCommand.parse(['--env-file', envPath]);
    } finally {
      if (originalBaseUrl === undefined) delete process.env.MUX_BASE_URL;
      else process.env.MUX_BASE_URL = originalBaseUrl;
    }

    const saved = await getEnvironment('default');
    expect(saved?.baseUrl).toBe('https://shell.example.com');
  });

  it('saves signing keys from environment variables when both are present', async () => {
    process.env.MUX_TOKEN_ID = 'env_id';
    process.env.MUX_TOKEN_SECRET = 'env_secret';
    process.env.MUX_SIGNING_KEY = 'key_env';
    process.env.MUX_PRIVATE_KEY = 'private_env';

    try {
      await loginCommand.parse([]);
    } finally {
      delete process.env.MUX_SIGNING_KEY;
      delete process.env.MUX_PRIVATE_KEY;
    }

    const saved = await getEnvironment('default');
    expect(saved?.signingKeyId).toBe('key_env');
    expect(saved?.signingPrivateKey).toBe('private_env');
  });

  it('preserves saved signing keys and forwardUrl when re-logging into the same environment', async () => {
    // The mocked /whoami returns env_mock_123, so this entry matches the
    // environment the new credentials belong to.
    await setEnvironment('default', {
      tokenId: 'old_id',
      tokenSecret: 'old_secret',
      environmentId: 'env_mock_123',
      signingKeyId: 'key_saved',
      signingPrivateKey: 'private_saved',
      forwardUrl: 'http://localhost:3000/webhooks',
    });
    process.env.MUX_TOKEN_ID = 'new_id';
    process.env.MUX_TOKEN_SECRET = 'new_secret';

    await loginCommand.parse([]);

    const saved = await getEnvironment('default');
    expect(saved?.tokenId).toBe('new_id');
    expect(saved?.signingKeyId).toBe('key_saved');
    expect(saved?.signingPrivateKey).toBe('private_saved');
    expect(saved?.forwardUrl).toBe('http://localhost:3000/webhooks');
  });

  it('does not carry signing keys over when the new credentials belong to a different environment', async () => {
    await setEnvironment('default', {
      tokenId: 'old_id',
      tokenSecret: 'old_secret',
      environmentId: 'env_different_999',
      signingKeyId: 'key_saved',
      signingPrivateKey: 'private_saved',
      forwardUrl: 'http://localhost:3000/webhooks',
    });
    process.env.MUX_TOKEN_ID = 'new_id';
    process.env.MUX_TOKEN_SECRET = 'new_secret';

    await loginCommand.parse([]);

    const saved = await getEnvironment('default');
    expect(saved?.tokenId).toBe('new_id');
    expect(saved?.signingKeyId).toBeUndefined();
    expect(saved?.signingPrivateKey).toBeUndefined();
    expect(saved?.forwardUrl).toBeUndefined();
  });

  it('does not preserve fields from a legacy entry with no environmentId', async () => {
    await setEnvironment('default', {
      tokenId: 'old_id',
      tokenSecret: 'old_secret',
      signingKeyId: 'key_saved',
      signingPrivateKey: 'private_saved',
    });
    process.env.MUX_TOKEN_ID = 'new_id';
    process.env.MUX_TOKEN_SECRET = 'new_secret';

    await loginCommand.parse([]);

    const saved = await getEnvironment('default');
    expect(saved?.signingKeyId).toBeUndefined();
  });

  it('prefers newly provided signing keys over preserved ones', async () => {
    await setEnvironment('default', {
      tokenId: 'old_id',
      tokenSecret: 'old_secret',
      environmentId: 'env_mock_123',
      signingKeyId: 'key_saved',
      signingPrivateKey: 'private_saved',
    });
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret\nMUX_SIGNING_KEY=key_new\nMUX_PRIVATE_KEY=private_new',
    );

    await loginCommand.parse(['--env-file', envPath]);

    const saved = await getEnvironment('default');
    expect(saved?.signingKeyId).toBe('key_new');
    expect(saved?.signingPrivateKey).toBe('private_new');
  });

  it('ignores signing keys when only one of the pair is present', async () => {
    const envPath = join(testConfigDir, '.env');
    await Bun.write(
      envPath,
      'MUX_TOKEN_ID=file_id\nMUX_TOKEN_SECRET=file_secret\nMUX_SIGNING_KEY=key_abc',
    );

    await loginCommand.parse(['--env-file', envPath]);

    const saved = await getEnvironment('default');
    expect(saved?.signingKeyId).toBeUndefined();
    expect(saved?.signingPrivateKey).toBeUndefined();
  });
});
