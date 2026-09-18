import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE (RFC 7636) helpers for the OAuth authorization code flow.
 *
 * The CLI is a public client — it ships no client secret — so PKCE is what
 * binds an authorization code to the process that requested it. Only the S256
 * method is implemented; `plain` offers no protection against an attacker who
 * can observe the redirect.
 */

/** 32 bytes of entropy, base64url encoded: 43 characters, within RFC 7636 bounds. */
const VERIFIER_BYTES = 32;
const STATE_BYTES = 32;

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * Generate a code verifier. Held only in process memory — never written to
 * disk, and never logged.
 */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(VERIFIER_BYTES));
}

/**
 * Derive the S256 code challenge sent on the authorization request.
 */
export function computeCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier, 'ascii').digest());
}

/**
 * Generate the `state` value that binds the redirect back to this login
 * attempt, guarding against a forged or replayed callback.
 */
export function generateState(): string {
  return base64url(randomBytes(STATE_BYTES));
}
