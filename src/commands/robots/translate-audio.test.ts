import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translateAudioCommand } from './translate-audio.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots translate-audio', () => {
  let tempDir: string;
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-robots-test-'));

    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(translateAudioCommand.getDescription()).toMatch(
        /translate.*audio/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = translateAudioCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'to-language-code',
      'no-upload',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = translateAudioCommand
        .getOptions()
        .find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await translateAudioCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('errors when --to-language-code is missing without --file', async () => {
      try {
        await translateAudioCommand.parse(['asset_abc']);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--to-language-code is required/i);
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await translateAudioCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/file not found/i);
    });

    test('errors when --file combined with --to-language-code', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ to_language_code: 'es' }));
      try {
        await translateAudioCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--to-language-code',
          'es',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--file cannot be combined/i);
    });
  });
});
