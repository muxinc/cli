import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux incidents list command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/incident/i);
    });
  });

  describe('Optional flags', () => {
    test('has --status flag for filtering by status', () => {
      const statusOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'status');
      expect(statusOption).toBeDefined();
    });

    test('has --severity flag for filtering by severity', () => {
      const severityOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'severity');
      expect(severityOption).toBeDefined();
    });

    test('has --order-by flag for sorting', () => {
      const orderByOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'order-by');
      expect(orderByOption).toBeDefined();
    });

    test('has --order-direction flag for sort direction', () => {
      const orderDirectionOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'order-direction');
      expect(orderDirectionOption).toBeDefined();
    });

    test('has --limit flag for pagination', () => {
      const limitOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'limit');
      expect(limitOption).toBeDefined();
    });

    test('has --page flag for pagination', () => {
      const pageOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'page');
      expect(pageOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --compact flag for grep-friendly output', () => {
      const compactOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'compact');
      expect(compactOption).toBeDefined();
    });
  });
});
