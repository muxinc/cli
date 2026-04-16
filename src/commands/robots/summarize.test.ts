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
import { summarizeCommand } from './summarize.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots summarize', () => {
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
      expect(summarizeCommand.getDescription()).toMatch(/summarize/i);
    });

    test('requires asset-id argument', () => {
      const args = summarizeCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Optional flags', () => {
    test('has --tone flag', () => {
      const opt = summarizeCommand.getOptions().find((o) => o.name === 'tone');
      expect(opt).toBeDefined();
    });

    test('has --language-code flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'language-code');
      expect(opt).toBeDefined();
    });

    test('has --output-language-code flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'output-language-code');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = summarizeCommand.getOptions().find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = summarizeCommand.getOptions().find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = summarizeCommand.getOptions().find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });

    test('has --prompt-task flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'prompt-task');
      expect(opt).toBeDefined();
    });

    test('has --prompt-title flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'prompt-title');
      expect(opt).toBeDefined();
    });

    test('has --prompt-description flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'prompt-description');
      expect(opt).toBeDefined();
    });

    test('has --prompt-keywords flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'prompt-keywords');
      expect(opt).toBeDefined();
    });

    test('has --prompt-quality-guidelines flag', () => {
      const opt = summarizeCommand
        .getOptions()
        .find((o) => o.name === 'prompt-quality-guidelines');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await summarizeCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('rejects invalid --tone value', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await summarizeCommand.parse(['asset_abc', '--tone', 'angry']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/tone/i);
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await summarizeCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/file not found/i);
    });

    test('errors when config file is invalid JSON', async () => {
      const configPath = join(tempDir, 'bad.json');
      await writeFile(configPath, '{ not json');
      try {
        await summarizeCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/invalid json/i);
    });

    test('errors when --file combined with a shape flag', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ tone: 'neutral' }));
      try {
        await summarizeCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--tone',
          'playful',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--file cannot be combined/i);
    });

    test('errors when file asset_id disagrees with positional', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ asset_id: 'other_asset' }));
      try {
        await summarizeCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/asset_id/i);
    });
  });
});
