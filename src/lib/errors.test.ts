import { describe, expect, test } from 'bun:test';
import { formatPermissionError } from './errors.ts';

describe('formatPermissionError', () => {
  test('includes token permissions and action items', () => {
    const result = formatPermissionError(['data:read', 'system:read']);
    expect(result).toContain('Permission denied or this route does not exist');
    expect(result).toContain('data:read, system:read');
    expect(result).toContain('dashboard.mux.com');
    expect(result).toContain('mux login');
  });

  test('includes token name when provided', () => {
    const result = formatPermissionError(['data:read'], 'My Token');
    expect(result).toContain('"My Token"');
    expect(result).toContain('data:read');
  });

  test('formats without token name when not provided', () => {
    const result = formatPermissionError(['data:read']);
    expect(result).toContain('Your token has permissions:');
    expect(result).not.toContain('undefined');
  });
});
