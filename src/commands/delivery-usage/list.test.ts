import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux delivery-usage list', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/delivery.*usage/i);
    });
  });

  describe('Optional flags', () => {
    test('has --asset-id flag for filtering by asset', () => {
      const assetIdOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'asset-id');
      expect(assetIdOption).toBeDefined();
    });

    test('has --live-stream-id flag for filtering by live stream', () => {
      const liveStreamIdOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'live-stream-id');
      expect(liveStreamIdOption).toBeDefined();
    });

    test('has --timeframe flag for filtering by time range', () => {
      const timeframeOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'timeframe');
      expect(timeframeOption).toBeDefined();
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
