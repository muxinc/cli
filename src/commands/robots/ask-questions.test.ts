import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { askQuestionsCommand } from './ask-questions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots ask-questions', () => {
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
      expect(askQuestionsCommand.getDescription()).toMatch(/ask.*questions/i);
    });

    test('requires asset-id argument', () => {
      const args = askQuestionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Required flags', () => {
    test('has --question flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'question');
      expect(opt).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --language-code flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'language-code');
      expect(opt).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'passthrough');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = askQuestionsCommand
        .getOptions()
        .find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await askQuestionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
