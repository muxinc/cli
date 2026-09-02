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
import { findScenesCommand } from './find-scenes.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots find-scenes', () => {
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
      expect(findScenesCommand.getDescription()).toMatch(/scene/i);
    });

    test('requires asset-id argument', () => {
      const args = findScenesCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'language-code',
      'min-scene-duration-ms',
      'min-scenes',
      'audience',
      'brand-term',
      'narration-detail',
      'start-time',
      'end-time',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = findScenesCommand.getOptions().find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await findScenesCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('rejects invalid --narration-detail value', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await findScenesCommand.parse([
          'asset_abc',
          '--narration-detail',
          'verbose',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/narration-detail/i);
    });
  });

  describe('--file mode', () => {
    test('errors when --file combined with --min-scenes', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ min_scenes: 3 }));
      try {
        await findScenesCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--min-scenes',
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
