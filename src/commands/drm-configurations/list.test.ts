import { describe, expect, test } from 'bun:test';
import { listCommand } from './list.ts';

describe('mux drm-configurations list command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/DRM/i);
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --limit flag with default of 25', () => {
      const limitOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'limit');
      expect(limitOption).toBeDefined();
      expect(limitOption?.default).toBe(25);
    });

    test('has --page flag with default of 1', () => {
      const pageOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'page');
      expect(pageOption).toBeDefined();
      expect(pageOption?.default).toBe(1);
    });

    test('has --compact flag for compact output', () => {
      const compactOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'compact');
      expect(compactOption).toBeDefined();
    });
  });
});
