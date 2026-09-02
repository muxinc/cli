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
import { findBestThumbnailsCommand } from './find-best-thumbnails.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots find-best-thumbnails', () => {
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
      expect(findBestThumbnailsCommand.getDescription()).toMatch(/thumbnail/i);
    });

    test('requires asset-id argument', () => {
      const args = findBestThumbnailsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'max-thumbnails',
      'update-asset-thumbnail',
      'audience',
      'campaign-style',
      'looking-for',
      'start-time',
      'end-time',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = findBestThumbnailsCommand
        .getOptions()
        .find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await findBestThumbnailsCommand.parse([]);
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
        await findBestThumbnailsCommand.parse([
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

    test('errors when --file combined with --max-thumbnails', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ max_thumbnails: 3 }));
      try {
        await findBestThumbnailsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--max-thumbnails',
          '3',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--file cannot be combined/i);
    });

    test('errors when --file combined with steering flags', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({}));
      try {
        await findBestThumbnailsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--audience',
          'developers',
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
