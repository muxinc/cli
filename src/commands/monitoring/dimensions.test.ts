import { describe, expect, test } from 'bun:test';
import { dimensionsCommand } from './dimensions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux monitoring dimensions command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(dimensionsCommand.getDescription()).toMatch(/dimension/i);
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = dimensionsCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });
});
