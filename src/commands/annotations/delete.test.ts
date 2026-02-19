import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { deleteCommand } from './delete.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux annotations delete command', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Spy on console.error to capture error messages
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(deleteCommand.getDescription()).toMatch(/annotation/i);
    });

    test('requires annotation-id argument', () => {
      const args = deleteCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('annotation-id');
    });
  });

  describe('Optional flags', () => {
    test('has --force flag to skip confirmation', () => {
      const forceOption = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'force');
      expect(forceOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when annotation-id is not provided', async () => {
      try {
        await deleteCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
