import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { summarizeCommand } from './summarize.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots summarize', () => {
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
  });
});
