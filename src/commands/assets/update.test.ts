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

describe('mux assets update command', () => {
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
      expect(updateCommand.getDescription()).toMatch(/update.*asset/i);
    });

    test('requires asset-id argument', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Optional flags', () => {
    test('has --title flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'title');
      expect(option).toBeDefined();
    });

    test('has --creator-id flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'creator-id');
      expect(option).toBeDefined();
    });

    test('has --external-id flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'external-id');
      expect(option).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(option).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await updateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('errors when no field flags are provided', async () => {
      try {
        await updateCommand.parse(['some-asset-id']);
      } catch (_error) {
        // Expected to throw due to no field flags
      }

      expect(exitSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
