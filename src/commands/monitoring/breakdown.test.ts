import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { breakdownCommand } from './breakdown.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring breakdown command', () => {
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
      expect(breakdownCommand.getDescription()).toMatch(/breakdown/i);
    });

    test('requires metric-id argument', () => {
      const args = breakdownCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('metric-id');
    });
  });

  describe('Optional flags', () => {
    test('has --dimension flag for specifying dimension', () => {
      const dimensionOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'dimension');
      expect(dimensionOption).toBeDefined();
    });

    test('has --order-by flag for sorting', () => {
      const orderByOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'order-by');
      expect(orderByOption).toBeDefined();
    });

    test('has --order-direction flag for sort direction', () => {
      const orderDirectionOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'order-direction');
      expect(orderDirectionOption).toBeDefined();
    });

    test('has --timestamp flag for filtering by timestamp', () => {
      const timestampOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'timestamp');
      expect(timestampOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --filters flag for filtering results', () => {
      const filtersOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'filters');
      expect(filtersOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when metric-id is not provided', async () => {
      try {
        await breakdownCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
