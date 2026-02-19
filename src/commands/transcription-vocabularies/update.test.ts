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

describe('mux transcription-vocabularies update', () => {
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
      expect(updateCommand.getDescription()).toMatch(
        /transcription.*vocabulary/i,
      );
    });

    test('requires vocabulary-id argument', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('vocabulary-id');
    });
  });

  describe('Required flags', () => {
    test('has --phrase flag', () => {
      const phraseOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'phrase');
      expect(phraseOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --name flag', () => {
      const nameOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'name');
      expect(nameOption).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const passthroughOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(passthroughOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when vocabulary-id is not provided', async () => {
      try {
        await updateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
