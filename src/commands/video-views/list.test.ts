import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux video-views list command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/video.*view/i);
    });
  });

  describe('Optional flags', () => {
    test('has --viewer-id flag for filtering by viewer', () => {
      const viewerIdOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'viewer-id');
      expect(viewerIdOption).toBeDefined();
    });

    test('has --error-id flag for filtering by error', () => {
      const errorIdOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'error-id');
      expect(errorIdOption).toBeDefined();
    });

    test('has --order-direction flag for sorting', () => {
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
