import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux metrics list command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/metric/i);
    });
  });

  describe('Optional flags', () => {
    test('has --dimension flag for filtering by dimension', () => {
      const dimensionOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'dimension');
      expect(dimensionOption).toBeDefined();
    });

    test('has --value flag for filtering by value', () => {
      const valueOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'value');
      expect(valueOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --filters flag for filtering results', () => {
      const filtersOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'filters');
      expect(filtersOption).toBeDefined();
    });

    test('has --timeframe flag for filtering by time range', () => {
      const timeframeOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'timeframe');
      expect(timeframeOption).toBeDefined();
    });
  });
});
