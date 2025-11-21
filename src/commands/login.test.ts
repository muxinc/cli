import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { parseEnvFile, type EnvVars } from './login.ts';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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
MUX_TOKEN_SECRET=test_secret_456`
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
MUX_TOKEN_SECRET="test_secret_456"`
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
MUX_TOKEN_SECRET='test_secret_456'`
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
MUX_TOKEN_SECRET=test_secret_456`
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

`
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
MUX_TOKEN_SECRET = test_secret_456`
    );

    const result = await parseEnvFile(envPath);

    expect(result.MUX_TOKEN_ID).toBe('test_id_123');
    expect(result.MUX_TOKEN_SECRET).toBe('test_secret_456');
  });

  it('should ignore other environment variables', async () => {
    const envPath = join(testDir, '.env');
    await Bun.write(
      envPath,
      `OTHER_VAR=other_value
MUX_TOKEN_ID=test_id_123
ANOTHER_VAR=another_value
MUX_TOKEN_SECRET=test_secret_456
YET_ANOTHER=yet_another`
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
ANOTHER_VAR=another_value`
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
MUX_TOKEN_SECRET=secret!@#$%^&*()`
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
MUX_TOKEN_SECRET=secret=with=equals`
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
