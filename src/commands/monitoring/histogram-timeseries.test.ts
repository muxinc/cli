import { describe, expect, test } from 'bun:test';
import { histogramTimeseriesCommand } from './histogram-timeseries.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring histogram-timeseries command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(histogramTimeseriesCommand.getDescription()).toMatch(/histogram/i);
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = histogramTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --filters flag for filtering results', () => {
      const filtersOption = histogramTimeseriesCommand
        .getOptions()
        .find((opt) => opt.name === 'filters');
      expect(filtersOption).toBeDefined();
    });
  });
});
