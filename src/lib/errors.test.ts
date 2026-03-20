import { describe, expect, test } from 'bun:test';
import {
  formatPermissionError,
  getRequiredPermission,
  isPermissionError,
} from './errors.ts';

describe('getRequiredPermission', () => {
  test('maps video read commands correctly', () => {
    expect(getRequiredPermission('assets', 'get')).toBe('video:read');
    expect(getRequiredPermission('assets', 'list')).toBe('video:read');
    expect(getRequiredPermission('live', 'get')).toBe('video:read');
    expect(getRequiredPermission('live', 'list')).toBe('video:read');
    expect(getRequiredPermission('uploads', 'get')).toBe('video:read');
    expect(getRequiredPermission('delivery-usage', 'list')).toBe('video:read');
  });

  test('maps video write commands correctly', () => {
    expect(getRequiredPermission('assets', 'create')).toBe('video:write');
    expect(getRequiredPermission('assets', 'update')).toBe('video:write');
    expect(getRequiredPermission('assets', 'delete')).toBe('video:write');
    expect(getRequiredPermission('live', 'create')).toBe('video:write');
    expect(getRequiredPermission('live', 'enable')).toBe('video:write');
    expect(getRequiredPermission('uploads', 'create')).toBe('video:write');
  });

  test('maps data read commands correctly', () => {
    expect(getRequiredPermission('metrics', 'list')).toBe('data:read');
    expect(getRequiredPermission('video-views', 'get')).toBe('data:read');
    expect(getRequiredPermission('monitoring', 'breakdown')).toBe('data:read');
    expect(getRequiredPermission('incidents', 'list')).toBe('data:read');
    expect(getRequiredPermission('dimensions', 'list')).toBe('data:read');
    expect(getRequiredPermission('errors', 'list')).toBe('data:read');
    expect(getRequiredPermission('exports', 'list')).toBe('data:read');
    expect(getRequiredPermission('annotations', 'get')).toBe('data:read');
  });

  test('maps data write commands correctly', () => {
    expect(getRequiredPermission('annotations', 'create')).toBe('data:write');
    expect(getRequiredPermission('annotations', 'update')).toBe('data:write');
    expect(getRequiredPermission('annotations', 'delete')).toBe('data:write');
  });

  test('maps system commands correctly', () => {
    expect(getRequiredPermission('webhooks', 'listen')).toBe('system:read');
    expect(getRequiredPermission('signing-keys', 'get')).toBe('system:read');
    expect(getRequiredPermission('signing-keys', 'list')).toBe('system:read');
    expect(getRequiredPermission('signing-keys', 'create')).toBe(
      'system:write',
    );
    expect(getRequiredPermission('signing-keys', 'delete')).toBe(
      'system:write',
    );
  });

  test('returns undefined for unknown commands', () => {
    expect(getRequiredPermission('unknown', 'get')).toBeUndefined();
  });
});

describe('isPermissionError', () => {
  test('detects permission issue when token lacks required scope', () => {
    expect(isPermissionError('video:read', ['data:read'])).toBe(true);
    expect(isPermissionError('video:read', ['system:read'])).toBe(true);
    expect(isPermissionError('data:read', ['video:read'])).toBe(true);
  });

  test('returns false when token has the exact permission', () => {
    expect(isPermissionError('video:read', ['video:read'])).toBe(false);
    expect(isPermissionError('data:read', ['data:read'])).toBe(false);
  });

  test('returns false when token has write and read is required', () => {
    expect(isPermissionError('video:read', ['video:write'])).toBe(false);
  });

  test('detects when token has read but write is required', () => {
    expect(isPermissionError('video:write', ['video:read'])).toBe(true);
  });

  test('handles tokens with multiple permissions', () => {
    expect(isPermissionError('data:read', ['video:read', 'data:read'])).toBe(
      false,
    );
    expect(isPermissionError('system:read', ['video:read', 'data:read'])).toBe(
      true,
    );
  });
});

describe('formatPermissionError', () => {
  test('includes required permission and token permissions', () => {
    const result = formatPermissionError('video:read', [
      'data:read',
      'system:read',
    ]);
    expect(result).toContain('video:read');
    expect(result).toContain('data:read, system:read');
    expect(result).toContain('dashboard.mux.com');
    expect(result).toContain('mux login');
  });

  test('includes token name when provided', () => {
    const result = formatPermissionError(
      'video:read',
      ['data:read'],
      'My Token',
    );
    expect(result).toContain('My Token');
  });

  test('formats without token name when not provided', () => {
    const result = formatPermissionError('video:read', ['data:read']);
    expect(result).toContain('Your token has');
    expect(result).not.toContain('undefined');
  });
});
