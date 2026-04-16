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
import { translateCaptionsCommand } from './translate-captions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots translate-captions', () => {
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
      expect(translateCaptionsCommand.getDescription()).toMatch(
        /translate.*captions/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = translateCaptionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Required flags', () => {
    test('has --track-id flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'track-id');
      expect(opt).toBeDefined();
    });

    test('has --to-language-code flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'to-language-code');
      expect(opt).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --no-upload flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'no-upload');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = translateCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await translateCaptionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await translateCaptionsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/file not found/i);
    });

    test('errors when --file combined with --track-id', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(
        configPath,
        JSON.stringify({ track_id: 'track_1', to_language_code: 'es' }),
      );
      try {
        await translateCaptionsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--track-id',
          'track_2',
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
