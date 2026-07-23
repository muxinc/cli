import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setEnvironment } from '@/lib/config.ts';
import { signCommand } from './sign.ts';

// Note: Command execution tests sign real JWTs with a generated RSA key;
// signing is local, so no network access is involved.

describe('mux sign command', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;
  let consoleLogSpy: Mock<typeof console.log>;

  beforeEach(() => {
    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Spy on console methods to capture output
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(signCommand.getDescription()).toBe(
        'Sign a playback ID, returning a JWT token and signed playback URL',
      );
    });

    test('requires playback-id argument', () => {
      const args = signCommand.getArguments();
      expect(args.length).toBe(1);
      expect(args[0].name).toBe('playback-id');
    });

    test('has --expiration flag with default', () => {
      const expirationOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'expiration');
      expect(expirationOption).toBeDefined();
      expect(expirationOption?.default).toBe('7d');
    });

    test('has --type flag with default', () => {
      const typeOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'type');
      expect(typeOption).toBeDefined();
      expect(typeOption?.default).toBe('video');
    });

    test('has --json flag option', () => {
      const jsonOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --token-only flag option', () => {
      const tokenOnlyOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'token-only');
      expect(tokenOnlyOption).toBeDefined();
    });
  });

  describe('Type validation', () => {
    test('accepts valid type: video', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'video']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: thumbnail', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'thumbnail']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: gif', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'gif']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: storyboard', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'storyboard']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('rejects invalid type', async () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        await signCommand.parse(['test-playback-id', '--type', 'invalid']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/Invalid type/i);
      expect(errorMessage).toContain('video, thumbnail, gif, storyboard');
    });
  });

  describe('Command execution', () => {
    let testConfigDir: string;
    let originalXdgConfigHome: string | undefined;
    const originalEnvVars: Record<string, string | undefined> = {};
    const ENV_KEYS = [
      'MUX_TOKEN_ID',
      'MUX_TOKEN_SECRET',
      'MUX_SIGNING_KEY',
      'MUX_PRIVATE_KEY',
    ];

    // A real RSA key so mux.jwt can sign locally (no network involved)
    const { privateKey: privateKeyPem } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    const privateKeyBase64 = Buffer.from(privateKeyPem).toString('base64');

    // The Mux SDK places the key id in the payload's kid claim
    function decodeJwtPayload(token: string): { kid?: string } {
      return JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
    }

    function tokenFromOutput(): string {
      return String(consoleLogSpy.mock.calls.at(-1)?.[0]).trim();
    }

    beforeEach(async () => {
      testConfigDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
      originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = testConfigDir;
      for (const key of ENV_KEYS) {
        originalEnvVars[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(async () => {
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      for (const key of ENV_KEYS) {
        if (originalEnvVars[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvVars[key];
      }
      await rm(testConfigDir, { recursive: true, force: true });
    });

    test('error mentions env vars when signing keys are not configured anywhere', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
      });

      try {
        await signCommand.parse(['test-playback-id']);
      } catch (_error) {
        // Expected to fail via mocked process.exit
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = String(consoleErrorSpy.mock.calls[0][0]);
      expect(errorMessage).toContain('mux signing-keys create');
      expect(errorMessage).toContain('MUX_SIGNING_KEY');
      expect(errorMessage).toContain('MUX_PRIVATE_KEY');
    });

    test('signs with MUX_SIGNING_KEY/MUX_PRIVATE_KEY env vars and no stored config', async () => {
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      process.env.MUX_SIGNING_KEY = 'key_from_env';
      process.env.MUX_PRIVATE_KEY = privateKeyBase64;

      await signCommand.parse(['test-playback-id', '--token-only']);

      const payload = decodeJwtPayload(tokenFromOutput());
      expect(payload.kid).toBe('key_from_env');
    });

    test('env var signing keys take precedence over stored config keys', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        signingKeyId: 'key_from_config',
        signingPrivateKey: privateKeyBase64,
      });
      process.env.MUX_SIGNING_KEY = 'key_from_env';
      process.env.MUX_PRIVATE_KEY = privateKeyBase64;

      await signCommand.parse(['test-playback-id', '--token-only']);

      const payload = decodeJwtPayload(tokenFromOutput());
      expect(payload.kid).toBe('key_from_env');
    });

    test('still signs with stored config keys when env vars are absent', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        signingKeyId: 'key_from_config',
        signingPrivateKey: privateKeyBase64,
      });

      await signCommand.parse(['test-playback-id', '--token-only']);

      const payload = decodeJwtPayload(tokenFromOutput());
      expect(payload.kid).toBe('key_from_config');
    });

    test('uses stored signing keys when env credentials match the stored environment', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        environmentId: 'env_same_123',
        signingKeyId: 'key_from_config',
        signingPrivateKey: privateKeyBase64,
      });
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () =>
          new Response(
            JSON.stringify({ data: { environment_id: 'env_same_123' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )) as unknown as typeof fetch,
      );

      try {
        await signCommand.parse(['test-playback-id', '--token-only']);
      } finally {
        fetchSpy.mockRestore();
      }

      const payload = decodeJwtPayload(tokenFromOutput());
      expect(payload.kid).toBe('key_from_config');
    });

    test('refuses stored signing keys when env credentials point at a different environment', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        environmentId: 'env_stored_123',
        signingKeyId: 'key_from_config',
        signingPrivateKey: privateKeyBase64,
      });
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () =>
          new Response(
            JSON.stringify({ data: { environment_id: 'env_other_456' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )) as unknown as typeof fetch,
      );

      try {
        await signCommand.parse(['test-playback-id', '--token-only']);
      } catch (_error) {
        // Expected to fail via mocked process.exit
      } finally {
        fetchSpy.mockRestore();
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = String(consoleErrorSpy.mock.calls[0][0]);
      expect(errorMessage).toContain('Signing keys not configured');
    });

    test('ignores env signing keys when only one of the pair is set', async () => {
      await setEnvironment('default', {
        tokenId: 'stored_id',
        tokenSecret: 'stored_secret',
        signingKeyId: 'key_from_config',
        signingPrivateKey: privateKeyBase64,
      });
      process.env.MUX_SIGNING_KEY = 'key_from_env';

      await signCommand.parse(['test-playback-id', '--token-only']);

      const payload = decodeJwtPayload(tokenFromOutput());
      expect(payload.kid).toBe('key_from_config');
    });
  });
});
