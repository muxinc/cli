import { describe, expect, test } from 'bun:test';
import { createCommand } from './create.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux annotations create command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(createCommand.getDescription()).toMatch(/annotation/i);
    });
  });

  describe('Optional flags', () => {
    test('has --date flag for specifying annotation date', () => {
      const dateOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'date');
      expect(dateOption).toBeDefined();
    });

    test('has --note flag for specifying annotation note', () => {
      const noteOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'note');
      expect(noteOption).toBeDefined();
    });

    test('has --sub-property-id flag for specifying sub-property', () => {
      const subPropertyIdOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'sub-property-id');
      expect(subPropertyIdOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });
});
