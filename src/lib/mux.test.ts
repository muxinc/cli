import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCurrentEnvironment } from './config.ts';
import { setEnvironment } from './config.ts';
import { DEFAULT_BASE_URL, getMuxUrl } from './mux.ts';

describe('getMuxUrl', () => {
  let testConfigDir: string;
  let originalXdgConfigHome: string | undefined;
  let originalMuxBaseUrl: string | undefined;

  beforeEach(async () => {
    testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    originalMuxBaseUrl = process.env.MUX_BASE_URL;
    process.env.XDG_CONFIG_HOME = testConfigDir;
    delete process.env.MUX_BASE_URL;
  });

  afterEach(async () => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (originalMuxBaseUrl === undefined) {
      delete process.env.MUX_BASE_URL;
    } else {
      process.env.MUX_BASE_URL = originalMuxBaseUrl;
    }
    await rm(testConfigDir, { recursive: true, force: true });
  });

  it('should return default when no env var or config', async () => {
    const env = await getCurrentEnvironment();
    expect(getMuxUrl(env)).toBe(DEFAULT_BASE_URL);
  });

  it('should prefer MUX_BASE_URL env var over everything', async () => {
    process.env.MUX_BASE_URL = 'https://env-var.example.com';
    await setEnvironment('default', {
      tokenId: 'id',
      tokenSecret: 'secret',
      baseUrl: 'https://config.example.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxUrl(env)).toBe('https://env-var.example.com');
  });

  it('should use config baseUrl when no env var is set', async () => {
    await setEnvironment('default', {
      tokenId: 'id',
      tokenSecret: 'secret',
      baseUrl: 'https://api.staging.mux.com',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxUrl(env)).toBe('https://api.staging.mux.com');
  });

  it('should fall back to default when config has no baseUrl', async () => {
    await setEnvironment('default', {
      tokenId: 'id',
      tokenSecret: 'secret',
    });

    const env = await getCurrentEnvironment();
    expect(getMuxUrl(env)).toBe(DEFAULT_BASE_URL);
  });
});
