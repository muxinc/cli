import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { timeseriesCommand } from './timeseries.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring timeseries command', () => {
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
      expect(timeseriesCommand.getDescription()).toMatch(/timeseries/i);
    });

    test('requires metric-id argument', () => {
      const args = timeseriesCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('metric-id');
    });
  });

  describe('Optional flags', () => {
    test('has --timestamp flag for filtering by timestamp', () => {
      const timestampOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'timestamp');
      expect(timestampOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --filters flag for filtering results', () => {
      const filtersOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'filters');
      expect(filtersOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when metric-id is not provided', async () => {
      try {
        await timeseriesCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
