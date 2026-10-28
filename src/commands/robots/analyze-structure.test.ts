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
import { analyzeStructureCommand } from './analyze-structure.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots analyze-structure', () => {
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
      expect(analyzeStructureCommand.getDescription()).toMatch(/scene/i);
    });

    test('requires asset-id argument', () => {
      const args = analyzeStructureCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'language-code',
      'audience',
      'brand-term',
      'granularity',
      'start-time',
      'end-time',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = analyzeStructureCommand
        .getOptions()
        .find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await analyzeStructureCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('rejects invalid --granularity value', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await analyzeStructureCommand.parse([
          'asset_abc',
          '--granularity',
          'verbose',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/granularity/i);
    });
  });

  describe('--file mode', () => {
    test('errors when --file combined with --granularity', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(
        configPath,
        JSON.stringify({ output_steering: { granularity: 'fine' } }),
      );
      try {
        await analyzeStructureCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--granularity',
          'fine',
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
