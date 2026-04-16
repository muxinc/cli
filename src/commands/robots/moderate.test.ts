import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { moderateCommand } from './moderate.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots moderate', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
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
  });
});
