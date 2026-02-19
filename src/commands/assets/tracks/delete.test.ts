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

describe('mux assets tracks delete command', () => {
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
      expect(deleteCommand.getDescription()).toMatch(/delete.*track/i);
    });

    test('requires asset-id and track-id arguments', () => {
      const args = deleteCommand.getArguments();
      expect(args.length).toBe(2);
      expect(args[0].name).toBe('asset-id');
      expect(args[1].name).toBe('track-id');
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
    test('throws error when arguments are not provided', async () => {
      try {
        await deleteCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
