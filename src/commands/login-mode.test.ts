import { describe, expect, it } from 'bun:test';
import { ENV_VARS_DETECTED_MESSAGE, resolveLoginMode } from './login-mode.ts';

const WITH_ENV = { MUX_TOKEN_ID: 'id', MUX_TOKEN_SECRET: 'secret' };
const NO_ENV = {};

describe('resolveLoginMode', () => {
  describe('with no shell credentials', () => {
    it('defaults to OAuth', () => {
      expect(resolveLoginMode({}, NO_ENV)).toBe('oauth');
    });

    it('honors each explicit mode', () => {
      expect(resolveLoginMode({ oauth: true }, NO_ENV)).toBe('oauth');
      expect(resolveLoginMode({ interactive: true }, NO_ENV)).toBe(
        'interactive',
      );
      expect(resolveLoginMode({ envFile: '.env' }, NO_ENV)).toBe('env-file');
    });

    it('rejects --from-env with a message naming the missing variables', () => {
      expect(() => resolveLoginMode({ fromEnv: true }, NO_ENV)).toThrow(
        /MUX_TOKEN_ID and MUX_TOKEN_SECRET are not set/,
      );
    });

    it('points at the alternatives when --from-env cannot be satisfied', () => {
      expect(() => resolveLoginMode({ fromEnv: true }, NO_ENV)).toThrow(
        /--env-file|--interactive|--oauth/,
      );
    });
  });

  describe('with shell credentials present', () => {
    it('refuses to guess, and explains that no login is needed', () => {
      expect(() => resolveLoginMode({}, WITH_ENV)).toThrow(
        /MUX_TOKEN_ID and MUX_TOKEN_SECRET detected/,
      );
    });

    it('lists all four ways to log in explicitly', () => {
      const message = ENV_VARS_DETECTED_MESSAGE;

      expect(message).toContain('--from-env');
      expect(message).toContain('--env-file');
      expect(message).toContain('--interactive');
      expect(message).toContain('--oauth');
    });

    it('says commands work without logging in at all', () => {
      expect(ENV_VARS_DETECTED_MESSAGE).toMatch(
        /No .?mux login.? is necessary|without calling/i,
      );
    });

    it('accepts --from-env', () => {
      expect(resolveLoginMode({ fromEnv: true }, WITH_ENV)).toBe('from-env');
    });

    it('accepts the other explicit modes too', () => {
      // Shell credentials do not force the from-env path: the caller may want a
      // browser login or a specific file saved instead.
      expect(resolveLoginMode({ oauth: true }, WITH_ENV)).toBe('oauth');
      expect(resolveLoginMode({ interactive: true }, WITH_ENV)).toBe(
        'interactive',
      );
      expect(resolveLoginMode({ envFile: '.env' }, WITH_ENV)).toBe('env-file');
    });
  });

  describe('mutual exclusivity', () => {
    it('rejects two modes at once', () => {
      expect(() =>
        resolveLoginMode({ oauth: true, interactive: true }, NO_ENV),
      ).toThrow(/only one/i);
    });

    it('names the flags that conflicted', () => {
      expect(() =>
        resolveLoginMode({ envFile: '.env', fromEnv: true }, WITH_ENV),
      ).toThrow(/--env-file.*--from-env|--from-env.*--env-file/s);
    });

    it('rejects three or more', () => {
      expect(() =>
        resolveLoginMode(
          { oauth: true, interactive: true, fromEnv: true },
          NO_ENV,
        ),
      ).toThrow(/only one/i);
    });

    it('allows a single mode alongside unrelated flags', () => {
      expect(
        resolveLoginMode(
          { oauth: true, name: 'staging', printUrl: true },
          NO_ENV,
        ),
      ).toBe('oauth');
    });
  });
});
