import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  mock,
  spyOn,
  test,
} from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Mux from '@mux/ts';
import * as configModule from '@/lib/config.ts';
import { getEnvironment, setEnvironment } from '@/lib/config.ts';
import * as envFileModule from '@/lib/env-file.ts';
import * as muxModule from '@/lib/mux.ts';
import { createCommand } from './create.ts';

describe('mux signing-keys create command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(createCommand.getDescription()).toBe(
        'Create a signing key and save to current environment (private key only available at creation)',
      );
    });

    test('has --json flag option', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.description).toContain('JSON');
    });

    test('has no required arguments', () => {
      const args = createCommand.getArguments();
      expect(args.length).toBe(0);
    });
  });

  describe('Action', () => {
    let testConfigDir: string;
    let originalXdgConfigHome: string | undefined;
    let originalTokenId: string | undefined;
    let originalTokenSecret: string | undefined;
    let logSpy: Mock<typeof console.log>;
    let errorSpy: Mock<typeof console.error>;
    let exitSpy: Mock<typeof process.exit>;
    let fetchSpy: Mock<typeof fetch>;
    let muxClientSpy: Mock<typeof muxModule.createAuthenticatedMuxClient>;
    let createKeyMock: Mock<
      () => Promise<{ id: string; private_key: string; created_at: string }>
    >;

    // The whoami probe in resolveActiveEnvironment uses fetch directly; the
    // signing key creation goes through the SDK client, which binds fetch
    // internally and cannot be reliably intercepted via globalThis.fetch —
    // so the client itself is mocked (same pattern as live/create.test.ts).
    function mockApi(whoamiEnvironmentId: string) {
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
        input: string | URL | Request,
      ) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/system/v1/whoami')) {
          return new Response(
            JSON.stringify({
              data: { environment_id: whoamiEnvironmentId },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected fetch in test: ${url}`);
      }) as unknown as typeof fetch);
    }

    function jsonOutput(): Record<string, unknown> {
      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      return JSON.parse(output);
    }

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
      createKeyMock = mock(() =>
        Promise.resolve({
          id: 'key_new_123',
          private_key: 'cHJpdmF0ZS1rZXktcGVt',
          created_at: '1721500000',
        }),
      );
      muxClientSpy = spyOn(
        muxModule,
        'createAuthenticatedMuxClient',
      ).mockImplementation(
        async () =>
          ({
            system: { signingKeys: { create: createKeyMock } },
          }) as unknown as Mux,
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
      if (originalTokenSecret === undefined)
        delete process.env.MUX_TOKEN_SECRET;
      else process.env.MUX_TOKEN_SECRET = originalTokenSecret;
      logSpy?.mockRestore();
      errorSpy?.mockRestore();
      exitSpy?.mockRestore();
      fetchSpy?.mockRestore();
      muxClientSpy?.mockRestore();
      await rm(testConfigDir, { recursive: true, force: true });
    });

    test('saves the key to the stored environment when credentials come from config', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
      });
      mockApi('env_stored_123');

      await createCommand.parse(['--json']);

      const saved = await getEnvironment('default');
      expect(saved?.signingKeyId).toBe('key_new_123');
      expect(saved?.signingPrivateKey).toBe('cHJpdmF0ZS1rZXktcGVt');
      const parsed = jsonOutput();
      expect(parsed.id).toBe('key_new_123');
      expect(parsed.saved).toBe(true);
      expect(parsed.private_key).toBeUndefined();
    });

    test('emits the private key once with saved: false when only env vars are set', async () => {
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      mockApi('env_from_vars');

      await createCommand.parse(['--json']);

      const parsed = jsonOutput();
      expect(parsed.id).toBe('key_new_123');
      expect(parsed.saved).toBe(false);
      expect(parsed.private_key).toBe('cHJpdmF0ZS1rZXktcGVt');
      expect(String(parsed.note)).toContain('MUX_SIGNING_KEY');
    });

    test('does not save to a stored environment that env var credentials do not match', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
        signingKeyId: 'key_existing',
        signingPrivateKey: 'existing_private_key',
      });
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      mockApi('env_other_456');

      await createCommand.parse(['--json']);

      const saved = await getEnvironment('default');
      expect(saved?.signingKeyId).toBe('key_existing');
      expect(saved?.signingPrivateKey).toBe('existing_private_key');
      const parsed = jsonOutput();
      expect(parsed.saved).toBe(false);
      expect(parsed.private_key).toBe('cHJpdmF0ZS1rZXktcGVt');
    });

    test('saves to a non-default stored environment when env var credentials match it', async () => {
      await setEnvironment('production', {
        token: { tokenId: 'prod_id', tokenSecret: 'prod_secret' },
        environmentId: 'env_prod_123',
      });
      await setEnvironment('staging', {
        token: { tokenId: 'staging_id', tokenSecret: 'staging_secret' },
        environmentId: 'env_staging_456',
      });
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      mockApi('env_staging_456');

      await createCommand.parse(['--json']);

      const staging = await getEnvironment('staging');
      expect(staging?.signingKeyId).toBe('key_new_123');
      const production = await getEnvironment('production');
      expect(production?.signingKeyId).toBeUndefined();
      const parsed = jsonOutput();
      expect(parsed.saved).toBe(true);
      expect(parsed.environment).toBe('staging');
    });

    test('saves to the stored environment when env var credentials match it', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_same_123',
      });
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      mockApi('env_same_123');

      await createCommand.parse(['--json']);

      const saved = await getEnvironment('default');
      expect(saved?.signingKeyId).toBe('key_new_123');
      const parsed = jsonOutput();
      expect(parsed.saved).toBe(true);
    });

    test('fails fast in JSON mode when a signing key exists and --force is omitted', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
        signingKeyId: 'key_existing',
        signingPrivateKey: 'existing_private_key',
      });
      mockApi('env_stored_123');

      try {
        await createCommand.parse(['--json']);
      } catch (_error) {
        // Expected to throw via mocked process.exit
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
      expect(parsed.error).toContain('--force');
      expect(parsed.error).toContain('key_existing');
      const saved = await getEnvironment('default');
      expect(saved?.signingKeyId).toBe('key_existing');
      expect(saved?.signingPrivateKey).toBe('existing_private_key');
    });

    test('replaces an existing signing key in JSON mode with --force', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
        signingKeyId: 'key_existing',
        signingPrivateKey: 'existing_private_key',
      });
      mockApi('env_stored_123');

      await createCommand.parse(['--json', '--force']);

      const saved = await getEnvironment('default');
      expect(saved?.signingKeyId).toBe('key_new_123');
      const parsed = jsonOutput();
      expect(parsed.saved).toBe(true);
    });

    test('emits the private key once when saving to config fails', async () => {
      await setEnvironment('default', {
        token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
        environmentId: 'env_stored_123',
      });
      mockApi('env_stored_123');
      const updateSpy = spyOn(
        configModule,
        'updateEnvironment',
      ).mockImplementation(() => Promise.reject(new Error('disk full')));

      try {
        await createCommand.parse(['--json']);
      } finally {
        updateSpy.mockRestore();
      }

      expect(exitSpy).not.toHaveBeenCalled();
      const parsed = jsonOutput();
      expect(parsed.saved).toBe(false);
      expect(parsed.private_key).toBe('cHJpdmF0ZS1rZXktcGVt');
      expect(String(parsed.note)).toContain('failed');
      const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(stderr).toContain('Failed to save signing key');
      expect(stderr).not.toContain('cHJpdmF0ZS1rZXktcGVt');
    });

    test('prints the private key with guidance in pretty mode when not saved', async () => {
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      mockApi('env_from_vars');

      await createCommand.parse([]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('key_new_123');
      expect(output).toContain('cHJpdmF0ZS1rZXktcGVt');
      expect(output).toContain('MUX_SIGNING_KEY');
      expect(output).toContain('MUX_PRIVATE_KEY');
      expect(output).toContain('not saved');
    });

    describe('--env-file', () => {
      function allOutput(): string {
        return [...logSpy.mock.calls, ...errorSpy.mock.calls]
          .map((c) => String(c[0]))
          .join('\n');
      }

      test('has an --env-file option', () => {
        const option = createCommand
          .getOptions()
          .find((opt) => opt.name === 'env-file');
        expect(option).toBeDefined();
        expect(option?.description).toContain('MUX_SIGNING_KEY');
        expect(option?.description).toContain('MUX_PRIVATE_KEY');
      });

      test('writes the key to the env file and still saves it to the CLI config', async () => {
        await setEnvironment('default', {
          token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
          environmentId: 'env_stored_123',
        });
        mockApi('env_stored_123');
        const envPath = join(testConfigDir, '.env.local');

        await createCommand.parse(['--json', '--env-file', envPath]);

        expect(await readFile(envPath, 'utf-8')).toBe(
          'MUX_SIGNING_KEY=key_new_123\nMUX_PRIVATE_KEY=cHJpdmF0ZS1rZXktcGVt\n',
        );
        const saved = await getEnvironment('default');
        expect(saved?.signingKeyId).toBe('key_new_123');
        expect(saved?.signingPrivateKey).toBe('cHJpdmF0ZS1rZXktcGVt');
        const parsed = jsonOutput();
        expect(parsed.saved).toBe(true);
        expect(parsed.env_file).toMatchObject({
          path: envPath,
          created: true,
        });
        expect(parsed.private_key).toBeUndefined();
        expect(allOutput()).not.toContain('cHJpdmF0ZS1rZXktcGVt');
      });

      test('updates existing variables and keeps other lines', async () => {
        await setEnvironment('default', {
          token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
          environmentId: 'env_stored_123',
        });
        mockApi('env_stored_123');
        const envPath = join(testConfigDir, '.env.local');
        await Bun.write(
          envPath,
          'MUX_TOKEN_ID=abc\nMUX_SIGNING_KEY=key_old\nMUX_PRIVATE_KEY=old_pk\n',
        );

        await createCommand.parse(['--json', '--env-file', envPath]);

        expect(await readFile(envPath, 'utf-8')).toBe(
          'MUX_TOKEN_ID=abc\nMUX_SIGNING_KEY=key_new_123\nMUX_PRIVATE_KEY=cHJpdmF0ZS1rZXktcGVt\n',
        );
        const parsed = jsonOutput();
        expect(parsed.env_file).toMatchObject({
          created: false,
          updated: ['MUX_SIGNING_KEY', 'MUX_PRIVATE_KEY'],
          added: [],
        });
      });

      test('does not print the private key when no stored environment matches', async () => {
        process.env.MUX_TOKEN_ID = 'env_id';
        process.env.MUX_TOKEN_SECRET = 'env_secret';
        mockApi('env_from_vars');
        const envPath = join(testConfigDir, '.env.local');

        await createCommand.parse(['--json', '--env-file', envPath]);

        expect(await readFile(envPath, 'utf-8')).toContain(
          'MUX_PRIVATE_KEY=cHJpdmF0ZS1rZXktcGVt',
        );
        const parsed = jsonOutput();
        expect(parsed.saved).toBe(false);
        expect(parsed.private_key).toBeUndefined();
        expect(allOutput()).not.toContain('cHJpdmF0ZS1rZXktcGVt');
      });

      test('never prints the private key in pretty mode', async () => {
        process.env.MUX_TOKEN_ID = 'env_id';
        process.env.MUX_TOKEN_SECRET = 'env_secret';
        mockApi('env_from_vars');
        const envPath = join(testConfigDir, '.env.local');

        await createCommand.parse(['--env-file', envPath]);

        const output = allOutput();
        expect(output).toContain('key_new_123');
        expect(output).toContain(envPath);
        expect(output).not.toContain('cHJpdmF0ZS1rZXktcGVt');
      });

      test('fails before creating a key when the env file cannot be written', async () => {
        await setEnvironment('default', {
          token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
          environmentId: 'env_stored_123',
        });
        mockApi('env_stored_123');
        const envPath = join(testConfigDir, 'missing-dir', '.env.local');

        try {
          await createCommand.parse(['--json', '--env-file', envPath]);
        } catch (_error) {
          // Expected to throw via mocked process.exit
        }

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(createKeyMock).not.toHaveBeenCalled();
        const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
        expect(parsed.error).toMatch(/directory/i);
      });

      test('warns when the env file is not gitignored', async () => {
        const init = Bun.spawnSync(['git', 'init', '-q', testConfigDir]);
        if (init.exitCode !== 0) return; // git unavailable on this machine
        process.env.MUX_TOKEN_ID = 'env_id';
        process.env.MUX_TOKEN_SECRET = 'env_secret';
        mockApi('env_from_vars');
        const envPath = join(testConfigDir, '.env.local');

        await createCommand.parse(['--json', '--env-file', envPath]);

        const parsed = jsonOutput();
        expect(parsed.env_file).toMatchObject({ gitignored: false });
        expect((parsed.warnings as string[]).join('\n')).toMatch(
          /not ignored by git/i,
        );
      });

      test('does not warn when the env file is gitignored', async () => {
        const init = Bun.spawnSync(['git', 'init', '-q', testConfigDir]);
        if (init.exitCode !== 0) return; // git unavailable on this machine
        await Bun.write(join(testConfigDir, '.gitignore'), '.env*.local\n');
        process.env.MUX_TOKEN_ID = 'env_id';
        process.env.MUX_TOKEN_SECRET = 'env_secret';
        mockApi('env_from_vars');
        const envPath = join(testConfigDir, '.env.local');

        await createCommand.parse(['--json', '--env-file', envPath]);

        const parsed = jsonOutput();
        expect(parsed.env_file).toMatchObject({ gitignored: true });
        expect(parsed.warnings).toEqual([]);
      });

      test('emits the private key once when the env file write fails and the config was not saved', async () => {
        process.env.MUX_TOKEN_ID = 'env_id';
        process.env.MUX_TOKEN_SECRET = 'env_secret';
        mockApi('env_from_vars');
        const envPath = join(testConfigDir, '.env.local');
        const writeSpy = spyOn(
          envFileModule,
          'writeEnvVars',
        ).mockImplementation(() => Promise.reject(new Error('disk full')));

        try {
          await createCommand.parse(['--json', '--env-file', envPath]);
        } finally {
          writeSpy.mockRestore();
        }

        expect(exitSpy).not.toHaveBeenCalled();
        const parsed = jsonOutput();
        expect(parsed.saved).toBe(false);
        expect(parsed.private_key).toBe('cHJpdmF0ZS1rZXktcGVt');
        const stderr = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(stderr).toContain('disk full');
      });

      test('keeps the private key out of output when the env file write fails but the config was saved', async () => {
        await setEnvironment('default', {
          token: { tokenId: 'stored_id', tokenSecret: 'stored_secret' },
          environmentId: 'env_stored_123',
        });
        mockApi('env_stored_123');
        const envPath = join(testConfigDir, '.env.local');
        const writeSpy = spyOn(
          envFileModule,
          'writeEnvVars',
        ).mockImplementation(() => Promise.reject(new Error('disk full')));

        try {
          await createCommand.parse(['--json', '--env-file', envPath]);
        } catch (_error) {
          // Expected to throw via mocked process.exit
        } finally {
          writeSpy.mockRestore();
        }

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect((await getEnvironment('default'))?.signingKeyId).toBe(
          'key_new_123',
        );
        expect(allOutput()).not.toContain('cHJpdmF0ZS1rZXktcGVt');
        const parsed = JSON.parse(String(errorSpy.mock.calls.at(-1)?.[0]));
        expect(parsed.error).toContain('disk full');
        expect(parsed.error).toContain('key_new_123');
      });
    });
  });
});
