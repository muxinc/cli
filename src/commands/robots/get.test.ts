import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { getCommand } from './get.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots get', () => {
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
      expect(getCommand.getDescription()).toMatch(/get.*job/i);
    });

    test('requires job-id argument', () => {
      const args = getCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('job-id');
    });
  });

  describe('Required flags', () => {
    test('has --workflow flag', () => {
      const opt = getCommand.getOptions().find((o) => o.name === 'workflow');
      expect(opt).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const opt = getCommand.getOptions().find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when job-id is not provided', async () => {
      try {
        await getCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
