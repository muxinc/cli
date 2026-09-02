import {
  flagCredential,
  getEnvironment,
  type OAuthCredentials,
  setCredential,
} from './config.ts';
import { OAuthError, refreshAccessToken } from './oauth.ts';
import { withRefreshLock } from './refresh-lock.ts';

/**
 * Access token refresh for stored OAuth logins.
 *
 * Refresh is invisible to commands: it happens inside credential resolution, so
 * no command needs to know an access token has a lifetime.
 */

/**
 * Refresh this far ahead of expiry. Covers clock drift between the CLI host and
 * the authorization server, plus the round-trip of the request about to be made.
 */
export const REFRESH_SKEW_SECONDS = 120;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Whether the stored access token should be refreshed before use. An unknown
 * expiry counts as expiring: better one unnecessary refresh than a request that
 * fails on a stale token.
 */
export function isAccessTokenExpiring(
  oauth: OAuthCredentials,
  skewSeconds = REFRESH_SKEW_SECONDS,
): boolean {
  if (!oauth.expiresAt) return true;
  return oauth.expiresAt - nowSeconds() <= skewSeconds;
}

/**
 * Refresh and persist, mapping a dead refresh token onto actionable guidance.
 * Retryable failures (network, 5xx) propagate unchanged so callers do not tell
 * the user to log in again over a flaky connection.
 */
async function refreshAndPersist(
  name: string,
  oauth: OAuthCredentials,
): Promise<OAuthCredentials> {
  let tokens: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    tokens = await refreshAccessToken(oauth.refreshToken);
  } catch (error) {
    if (error instanceof OAuthError && error.terminal) {
      // Flag rather than delete: the credential stays for the user to inspect,
      // `mux auth status` can explain it, and an access token pair on the same
      // environment becomes the preferred credential from here on.
      await flagCredential(name, 'oauth', {
        code: error.code ?? 'refresh_failed',
        at: new Date().toISOString(),
        message: error.message,
      });
      throw new Error(
        `The stored login for environment "${name}" is no longer valid (${
          error.code ?? 'refresh failed'
        }). Run 'mux login' to sign in again, or 'mux env switch <name>' to use a different environment.`,
      );
    }
    throw error;
  }

  const refreshed: OAuthCredentials = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
    ...(tokens.scope && { scope: tokens.scope }),
    // No lastError: a successful refresh clears any previous failure.
  };

  // Writes only the oauth block, so signing keys, forward URL, the token pair,
  // and the org/environment identity all survive untouched.
  await setCredential(name, 'oauth', refreshed);

  return refreshed;
}

/** The stored OAuth block for an environment, or null if it has none. */
async function readStoredOAuth(name: string): Promise<OAuthCredentials | null> {
  const stored = await getEnvironment(name);
  return stored?.oauth ?? null;
}

/**
 * Force a refresh regardless of the stored expiry. Used after a 401, where the
 * server has invalidated a token the CLI still considers fresh.
 */
export async function refreshEnvironmentTokens(
  name: string,
  oauth: OAuthCredentials,
): Promise<OAuthCredentials> {
  return withRefreshLock(async () => {
    const stored = await readStoredOAuth(name);

    // Another process (or another in-flight request) may have refreshed while
    // this one waited for the lock. A stored token that differs from the one
    // that just got a 401 is that replacement — use it rather than spending the
    // refresh token again, which under a burst of 401s would rotate N times for
    // no benefit.
    if (
      stored &&
      stored.accessToken !== oauth.accessToken &&
      !isAccessTokenExpiring(stored)
    ) {
      return stored;
    }

    return refreshAndPersist(name, stored ?? oauth);
  });
}

/**
 * Return credentials good for the request about to be made, refreshing first if
 * the access token is at or near expiry.
 */
export async function ensureFreshAccessToken(
  name: string,
  oauth: OAuthCredentials,
): Promise<OAuthCredentials> {
  if (!isAccessTokenExpiring(oauth)) {
    return oauth;
  }

  return withRefreshLock(async () => {
    // Re-read under the lock: another process may have refreshed while this one
    // waited, in which case its token is already on disk and spending our
    // refresh token again would invalidate theirs.
    const stored = await readStoredOAuth(name);
    if (stored && !isAccessTokenExpiring(stored)) {
      return stored;
    }

    return refreshAndPersist(name, stored ?? oauth);
  });
}
