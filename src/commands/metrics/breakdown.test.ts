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

describe('mux metrics breakdown command', () => {
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
    test('has --group-by flag for grouping results', () => {
      const groupByOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'group-by');
      expect(groupByOption).toBeDefined();
    });

    test('has --measurement flag for specifying measurement type', () => {
      const measurementOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'measurement');
      expect(measurementOption).toBeDefined();
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

    test('has --limit flag for pagination', () => {
      const limitOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'limit');
      expect(limitOption).toBeDefined();
    });

    test('has --page flag for pagination', () => {
      const pageOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'page');
      expect(pageOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --compact flag for grep-friendly output', () => {
      const compactOption = breakdownCommand
        .getOptions()
        .find((opt) => opt.name === 'compact');
      expect(compactOption).toBeDefined();
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
