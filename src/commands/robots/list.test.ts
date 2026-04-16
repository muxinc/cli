import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots list', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/list.*jobs/i);
    });
  });

  describe('Optional flags', () => {
    test('has --workflow flag for filtering by workflow type', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'workflow');
      expect(opt).toBeDefined();
    });

    test('has --status flag for filtering by job status', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'status');
      expect(opt).toBeDefined();
    });

    test('has --asset-id flag for filtering by asset', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'asset-id');
      expect(opt).toBeDefined();
    });

    test('has --limit flag for pagination', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'limit');
      expect(opt).toBeDefined();
    });

    test('has --page flag for pagination', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'page');
      expect(opt).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'json');
      expect(opt).toBeDefined();
    });

    test('has --compact flag for grep-friendly output', () => {
      const opt = listCommand.getOptions().find((o) => o.name === 'compact');
      expect(opt).toBeDefined();
    });
  });
});
