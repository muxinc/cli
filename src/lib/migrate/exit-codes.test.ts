import { describe, expect, test } from 'bun:test';
import { resolveExitCode } from './exit-codes.ts';

describe('resolveExitCode', () => {
  test('0 when nothing remains and nothing errored', () => {
    expect(resolveExitCode({ remaining: 0, errored: 0 })).toBe(0);
  });

  test('4 when work remains', () => {
    expect(resolveExitCode({ remaining: 3, errored: 0 })).toBe(4);
  });

  test('1 when only errored items remain, so re-running on 4 cannot loop', () => {
    expect(resolveExitCode({ remaining: 0, errored: 2 })).toBe(1);
  });

  test('4 wins over errored items while other work remains', () => {
    expect(resolveExitCode({ remaining: 3, errored: 2 })).toBe(4);
  });

  test('a failed command is 1 even when work remains', () => {
    expect(
      resolveExitCode({ commandFailed: true, remaining: 3, errored: 0 }),
    ).toBe(1);
  });

  test('confirmation required is 3 even when the command also failed', () => {
    expect(
      resolveExitCode({
        confirmationRequired: true,
        commandFailed: true,
        remaining: 3,
        errored: 0,
      }),
    ).toBe(3);
  });

  test('invalid usage is 2 over everything else', () => {
    expect(
      resolveExitCode({
        usageError: true,
        confirmationRequired: true,
        commandFailed: true,
        remaining: 3,
        errored: 1,
      }),
    ).toBe(2);
  });
});
