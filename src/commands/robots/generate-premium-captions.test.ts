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
import { generatePremiumCaptionsCommand } from './generate-premium-captions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots generate-premium-captions', () => {
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
      expect(generatePremiumCaptionsCommand.getDescription()).toMatch(
        /premium captions/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = generatePremiumCaptionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'language-code',
      'include-speakers',
      'include-words',
      'phrase',
      'replace-existing',
      'track-name',
      'no-upload',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = generatePremiumCaptionsCommand
        .getOptions()
        .find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });

    test('--phrase is repeatable', () => {
      const opt = generatePremiumCaptionsCommand
        .getOptions()
        .find((o) => o.name === 'phrase');
      expect(opt?.collect).toBe(true);
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await generatePremiumCaptionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('--file mode', () => {
    test('errors when --file combined with --language-code', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ language_code: 'en' }));
      try {
        await generatePremiumCaptionsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--language-code',
          'en',
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
