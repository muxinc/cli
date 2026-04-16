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
import { generateChaptersCommand } from './generate-chapters.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots generate-chapters', () => {
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
      expect(generateChaptersCommand.getDescription()).toMatch(
        /generate.*chapters/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = generateChaptersCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Optional flags', () => {
    test('has --language-code flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'language-code');
      expect(opt).toBeDefined();
    });

    test('has --output-language-code flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'output-language-code');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });

    test('has --prompt-task flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'prompt-task');
      expect(opt).toBeDefined();
    });

    test('has --prompt-output-format flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'prompt-output-format');
      expect(opt).toBeDefined();
    });

    test('has --prompt-chapter-guidelines flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'prompt-chapter-guidelines');
      expect(opt).toBeDefined();
    });

    test('has --prompt-title-guidelines flag', () => {
      const opt = generateChaptersCommand
        .getOptions()
        .find((o) => o.name === 'prompt-title-guidelines');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await generateChaptersCommand.parse([]);
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
        await generateChaptersCommand.parse([
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

    test('errors when --file combined with a shape flag', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ language_code: 'en' }));
      try {
        await generateChaptersCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--language-code',
          'fr',
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
