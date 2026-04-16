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
import { moderateCommand } from './moderate.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots moderate', () => {
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
      expect(moderateCommand.getDescription()).toMatch(/moderat/i);
    });

    test('requires asset-id argument', () => {
      const args = moderateCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Optional flags', () => {
    test('has --language-code flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'language-code');
      expect(opt).toBeDefined();
    });

    test('has --sampling-interval flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'sampling-interval');
      expect(opt).toBeDefined();
    });

    test('has --max-samples flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'max-samples');
      expect(opt).toBeDefined();
    });

    test('has --threshold-sexual flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'threshold-sexual');
      expect(opt).toBeDefined();
    });

    test('has --threshold-violence flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'threshold-violence');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = moderateCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = moderateCommand.getOptions().find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = moderateCommand.getOptions().find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = moderateCommand.getOptions().find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await moderateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('rejects --sampling-interval below 5', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await moderateCommand.parse(['asset_abc', '--sampling-interval', '3']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/sampling-interval|minimum|5/i);
    });

    test('rejects --threshold-sexual outside 0..1', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await moderateCommand.parse(['asset_abc', '--threshold-sexual', '1.5']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/threshold|0.*1/i);
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await moderateCommand.parse(['asset_abc', '--file', configPath]);
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
        await moderateCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/invalid json/i);
    });

    test('errors when --file combined with a shape flag', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ max_samples: 10 }));
      try {
        await moderateCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--max-samples',
          '20',
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
