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

describe('mux metrics timeseries command', () => {
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
    test('has --measurement flag for specifying measurement type', () => {
      const measurementOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'measurement');
      expect(measurementOption).toBeDefined();
    });

    test('has --group-by flag for grouping results', () => {
      const groupByOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'group-by');
      expect(groupByOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = timeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
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
