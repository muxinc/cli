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
import { findKeyMomentsCommand } from './find-key-moments.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots find-key-moments', () => {
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
      expect(findKeyMomentsCommand.getDescription()).toMatch(
        /find.*key.*moments/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = findKeyMomentsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Optional flags', () => {
    test('has --max-moments flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'max-moments');
      expect(opt).toBeDefined();
    });

    test('has --target-duration-min-ms flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'target-duration-min-ms');
      expect(opt).toBeDefined();
    });

    test('has --target-duration-max-ms flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'target-duration-max-ms');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --wait flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'wait');
      expect(opt).toBeDefined();
    });

    test('has --file flag', () => {
      const opt = findKeyMomentsCommand
        .getOptions()
        .find((o) => o.name === 'file');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await findKeyMomentsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('rejects --max-moments above 10', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await findKeyMomentsCommand.parse(['asset_abc', '--max-moments', '11']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/max-moments|10/i);
    });

    test('rejects --max-moments below 1', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await findKeyMomentsCommand.parse(['asset_abc', '--max-moments', '0']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/max-moments|1/i);
    });

    test('rejects --target-duration-min-ms without --target-duration-max-ms', async () => {
      try {
        await findKeyMomentsCommand.parse([
          'asset_abc',
          '--target-duration-min-ms',
          '5000',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/target-duration/i);
    });
  });

  describe('--file mode', () => {
    test('errors when config file does not exist', async () => {
      const configPath = join(tempDir, 'nope.json');
      try {
        await findKeyMomentsCommand.parse(['asset_abc', '--file', configPath]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/file not found/i);
    });

    test('errors when --file combined with a shape flag', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ max_moments: 3 }));
      try {
        await findKeyMomentsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--max-moments',
          '3',
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
