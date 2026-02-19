import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { breakdownTimeseriesCommand } from './breakdown-timeseries.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring breakdown-timeseries command', () => {
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
      expect(breakdownTimeseriesCommand.getDescription()).toMatch(
        /breakdown.*timeseries/i,
      );
    });

    test('requires metric-id argument', () => {
      const args = breakdownTimeseriesCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('metric-id');
    });
  });

  describe('Optional flags', () => {
    test('has --dimension flag for specifying dimension', () => {
      const dimensionOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'dimension');
      expect(dimensionOption).toBeDefined();
    });

    test('has --limit flag for pagination', () => {
      const limitOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'limit');
      expect(limitOption).toBeDefined();
    });

    test('has --order-by flag for sorting', () => {
      const orderByOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'order-by');
      expect(orderByOption).toBeDefined();
    });

    test('has --order-direction flag for sort direction', () => {
      const orderDirectionOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'order-direction');
      expect(orderDirectionOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --filters flag for filtering results', () => {
      const filtersOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'filters');
      expect(filtersOption).toBeDefined();
    });

    test('has --timeframe flag for filtering by time range', () => {
      const timeframeOption = breakdownTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'timeframe');
      expect(timeframeOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when metric-id is not provided', async () => {
      try {
        await breakdownTimeseriesCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
