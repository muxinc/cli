import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { APIError } from '@mux/ts';
import { setAgentMode } from './context.ts';
import { formatPermissionError, handleCommandError } from './errors.ts';
import * as mux from './mux.ts';

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

describe('Robots insufficient scope errors', () => {
  let errorSpy: ReturnType<typeof spyOn<typeof console, 'error'>>;
  let exitSpy: ReturnType<typeof spyOn<typeof process, 'exit'>>;
  let authSpy: ReturnType<typeof spyOn<typeof mux, 'getAuthContext'>>;

  beforeEach(() => {
    setAgentMode(false);
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    authSpy = spyOn(mux, 'getAuthContext').mockResolvedValue({
      headers: { Authorization: 'Basic fixture' },
      baseUrl: 'https://api.mux.com',
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    authSpy.mockRestore();
    setAgentMode(false);
  });

  function apiError(type: string, status = 403) {
    return APIError.generate(
      status,
      { error: { type, messages: ['This operation requires robots:write.'] } },
      undefined,
      new Headers(),
    );
  }

  test('preserves server messages and gives token replacement and env precedence guidance', async () => {
    await expect(
      handleCommandError(
        apiError('insufficient_scope'),
        'robots',
        'summarize',
        {},
      ),
    ).rejects.toThrow('process.exit called');
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('This operation requires robots:write.');
    expect(output).toContain('replacement token');
    expect(output).toContain('MUX_TOKEN_ID/MUX_TOKEN_SECRET');
    expect(output).toContain('override saved logins');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('gives OAuth reauthorization and narrowed grant guidance', async () => {
    authSpy.mockResolvedValue({
      headers: { Authorization: 'Bearer fixture' },
      baseUrl: 'https://api.mux.com',
    });
    await expect(
      handleCommandError(
        apiError('insufficient_scope'),
        'robots',
        'summarize',
        {},
      ),
    ).rejects.toThrow('process.exit called');
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('mux login --oauth --agent');
    expect(output).toContain('MUX_OAUTH_SCOPES');
    expect(output).toContain('organization admin');
    expect(output).not.toContain('replacement token');
  });

  test('preserves the permission error if local credentials cannot be resolved', async () => {
    authSpy.mockRejectedValue(new Error('No saved credentials'));
    await expect(
      handleCommandError(
        apiError('insufficient_scope'),
        'robots',
        'summarize',
        {},
      ),
    ).rejects.toThrow('process.exit called');
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('This operation requires robots:write.');
    expect(output).toContain('OAuth client');
    expect(output).not.toContain('No saved credentials');
  });

  for (const agent of [false, true]) {
    test(`keeps the API type and messages in ${agent ? 'agent' : 'JSON'} output`, async () => {
      setAgentMode(agent);
      await expect(
        handleCommandError(
          apiError('insufficient_scope'),
          'robots',
          'summarize',
          { json: !agent },
        ),
      ).rejects.toThrow('process.exit called');
      expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({
        error: 'insufficient_scope',
        api_response: {
          error: {
            type: 'insufficient_scope',
            messages: ['This operation requires robots:write.'],
          },
        },
      });
    });
  }

  for (const [group, type, status] of [
    ['robots', 'forbidden', 403],
    ['robots', 'robots_units_limit_exceeded', 403],
    ['robots', 'account_disabled', 403],
    ['robots', 'insufficient_scope', 500],
    ['video', 'insufficient_scope', 403],
  ] as const) {
    test(`does not relabel ${group} ${status} ${type}`, async () => {
      await expect(
        handleCommandError(apiError(type, status), group, 'create', {
          json: true,
        }),
      ).rejects.toThrow('process.exit called');
      expect(authSpy).not.toHaveBeenCalled();
      const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(output.error).not.toBe('insufficient_scope');
      expect(output).not.toHaveProperty('api_response');
    });
  }
});
