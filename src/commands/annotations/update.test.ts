import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { updateCommand } from './update.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux annotations update command', () => {
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
      expect(updateCommand.getDescription()).toMatch(/annotation/i);
    });

    test('requires annotation-id argument', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('annotation-id');
    });
  });

  describe('Optional flags', () => {
    test('has --date flag for specifying annotation date', () => {
      const dateOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'date');
      expect(dateOption).toBeDefined();
    });

    test('has --note flag for specifying annotation note', () => {
      const noteOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'note');
      expect(noteOption).toBeDefined();
    });

    test('has --sub-property-id flag for specifying sub-property', () => {
      const subPropertyIdOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'sub-property-id');
      expect(subPropertyIdOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when annotation-id is not provided', async () => {
      try {
        await updateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
