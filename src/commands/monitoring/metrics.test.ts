import { describe, expect, test } from 'bun:test';
import { metricsListCommand } from './metrics.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring metrics command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(metricsListCommand.getDescription()).toMatch(/metric/i);
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = metricsListCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });
});
