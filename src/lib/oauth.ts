/**
 * OAuth 2.0 authorization code + PKCE client for `mux login`.
 *
 * Endpoint values are centralized here so that confirming the authorization
 * server contract is a one-file change. Each is overridable by environment
 * variable, which is also how the test suite and staging environments point the
 * CLI at a non-production authorization server.
 */

import { discoverEndpoints } from './oauth-discovery.ts';

/**
 * Fallbacks used when discovery is unavailable and nothing is overridden.
 *
 * TODO: confirm against the Mux authorization server before release. Tracked as
 * the endpoint table in OAUTH_LOGIN_SPEC.md section 8. Once the discovery
 * document is deployed these matter only offline, or if it ever stops resolving.
 */
const DEFAULT_API_BASE_URL = 'https://api.mux.com';
const DEFAULT_CLIENT_ID = 'mux-cli';
const DEFAULT_AUTHORIZATION_URL = 'https://dashboard.mux.com/oauth/authorize';
const DEFAULT_TOKEN_URL = 'https://api.mux.com/oauth/token';
const DEFAULT_REVOCATION_URL = 'https://api.mux.com/oauth/revoke';

/**
 * Applied when a token response omits `expires_in`. A finite default is safer
 * than treating the token as immediately stale, which would refresh on every
 * command.
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;

/**
 * OAuth error codes that no amount of retrying will fix. Everything else —
 * transport failures, 5xx, throttling — is reported as retryable so callers can
 * distinguish "try again" from "log in again".
 */
const TERMINAL_ERROR_CODES = new Set([
  'invalid_grant',
  'invalid_client',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
  'unsupported_grant_type',
  'access_denied',
]);

export interface OAuthEndpoints {
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  revocationUrl: string;
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry in epoch seconds, computed from `expires_in` at receipt. */
  expiresAt: number;
  scope?: string;
  tokenType: 'Bearer';
}

interface OAuthErrorOptions {
  /** The OAuth `error` code, when the provider supplied one. */
  code?: string;
  /** HTTP status, when the failure came from a response rather than transport. */
  status?: number;
  /** False when retrying could plausibly succeed. */
  terminal: boolean;
}

/**
 * An OAuth failure. `terminal` separates "this credential is dead, log in
 * again" from "the network or server had a bad moment, retry".
 */
export class OAuthError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly terminal: boolean;

  constructor(message: string, options: OAuthErrorOptions) {
    super(message);
    this.name = 'OAuthError';
    this.code = options.code;
    this.status = options.status;
    this.terminal = options.terminal;
  }
}

/**
 * Resolve the authorization server configuration from environment overrides and
 * built-in defaults only. This is the offline floor: no network, always works.
 */
export function getOAuthEndpoints(): OAuthEndpoints {
  const scopes = process.env.MUX_OAUTH_SCOPES?.trim();

  return {
    clientId: process.env.MUX_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID,
    authorizationUrl:
      process.env.MUX_OAUTH_AUTHORIZE_URL || DEFAULT_AUTHORIZATION_URL,
    tokenUrl: process.env.MUX_OAUTH_TOKEN_URL || DEFAULT_TOKEN_URL,
    revocationUrl: process.env.MUX_OAUTH_REVOKE_URL || DEFAULT_REVOCATION_URL,
    scopes: scopes ? scopes.split(/[\s,]+/).filter(Boolean) : [],
  };
}

/** What the authorization server said it supports, when discovery succeeded. */
export interface ServerCapabilities {
  grantTypes?: string[];
  codeChallengeMethods?: string[];
  scopes?: string[];
  discoveredFrom?: string;
}

let capabilities: ServerCapabilities = {};

/**
 * What the last endpoint resolution learned about the server. Empty when
 * discovery has not run or was unavailable.
 */
export function getServerCapabilities(): ServerCapabilities {
  return capabilities;
}

/**
 * Resolve endpoints for use, preferring what the authorization server publishes.
 *
 * Order: explicit environment override > discovery document (cached up to a day)
 * > built-in default, applied per field. An endpoint that moves server-side is
 * picked up without a CLI release; a discovery outage changes nothing.
 */
export async function resolveOAuthEndpoints(
  apiBaseUrl?: string,
): Promise<OAuthEndpoints> {
  const defaults = getOAuthEndpoints();
  const baseUrl =
    apiBaseUrl || process.env.MUX_BASE_URL || DEFAULT_API_BASE_URL;

  const discovered = await discoverEndpoints(baseUrl);
  if (!discovered) {
    capabilities = {};
    return defaults;
  }

  capabilities = {
    ...(discovered.grantTypes && { grantTypes: discovered.grantTypes }),
    ...(discovered.codeChallengeMethods && {
      codeChallengeMethods: discovered.codeChallengeMethods,
    }),
    ...(discovered.scopes && { scopes: discovered.scopes }),
    discoveredFrom: discovered.discoveredFrom,
  };

  // An explicit override always wins: it is how staging and tests pin a host,
  // and a discovery document must not be able to override it.
  return {
    clientId: defaults.clientId,
    authorizationUrl:
      process.env.MUX_OAUTH_AUTHORIZE_URL ||
      discovered.authorizationUrl ||
      defaults.authorizationUrl,
    tokenUrl:
      process.env.MUX_OAUTH_TOKEN_URL ||
      discovered.tokenUrl ||
      defaults.tokenUrl,
    revocationUrl:
      process.env.MUX_OAUTH_REVOKE_URL ||
      discovered.revocationUrl ||
      defaults.revocationUrl,
    scopes: defaults.scopes,
  };
}

/**
 * Build the URL the user opens in their browser. Organization and environment
 * selection happens on that page, so no org/env parameters are sent.
 */
export function buildAuthorizationUrl(params: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
  endpoints?: OAuthEndpoints;
}): string {
  const endpoints = params.endpoints ?? getOAuthEndpoints();
  const url = new URL(endpoints.authorizationUrl);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', endpoints.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  if (endpoints.scopes.length > 0) {
    url.searchParams.set('scope', endpoints.scopes.join(' '));
  }

  return url.toString();
}

interface TokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * POST a form-encoded grant request. Transport failures become retryable
 * OAuthErrors; the caller decides how to report them.
 */
async function postForm(
  url: string,
  form: Record<string, string>,
): Promise<{ status: number; body: TokenResponseBody; raw: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(form).toString(),
    });
  } catch (error) {
    throw new OAuthError(
      `Could not reach the Mux authorization server at ${url} (${
        error instanceof Error ? error.message : String(error)
      }). Check your network connection and try again.`,
      { terminal: false },
    );
  }

  const raw = await response.text();
  let body: TokenResponseBody = {};
  try {
    body = raw ? (JSON.parse(raw) as TokenResponseBody) : {};
  } catch {
    // Non-JSON bodies (proxy error pages, for example) are reported by status.
    body = {};
  }

  return { status: response.status, body, raw };
}

function failureFrom(
  status: number,
  body: TokenResponseBody,
  fallbackContext: string,
): OAuthError {
  const code = body.error;
  const detail = body.error_description || body.error;
  // 5xx and 429 are transport-adjacent: the credential may still be good.
  const retryableStatus = status >= 500 || status === 429;
  const terminal = code
    ? TERMINAL_ERROR_CODES.has(code) && !retryableStatus
    : !retryableStatus;

  const message = detail
    ? `${fallbackContext}: ${detail} (HTTP ${status})`
    : `${fallbackContext}: HTTP ${status}`;

  return new OAuthError(message, { code, status, terminal });
}

function tokensFrom(
  body: TokenResponseBody,
  presentedRefreshToken?: string,
): OAuthTokens {
  if (!body.access_token) {
    throw new OAuthError(
      'The Mux authorization server did not return an access token.',
      { terminal: true },
    );
  }

  const refreshToken = body.refresh_token || presentedRefreshToken;
  if (!refreshToken) {
    throw new OAuthError(
      'The Mux authorization server did not return a refresh token, so the CLI could not keep the login alive.',
      { terminal: true },
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt:
      nowSeconds() + (body.expires_in ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
    ...(body.scope && { scope: body.scope }),
    tokenType: 'Bearer',
  };
}

/**
 * Exchange an authorization code for tokens. No client secret is sent — the
 * PKCE verifier is what proves this is the process that started the flow.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  endpoints?: OAuthEndpoints;
}): Promise<OAuthTokens> {
  const endpoints = params.endpoints ?? (await resolveOAuthEndpoints());

  const { status, body } = await postForm(endpoints.tokenUrl, {
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: endpoints.clientId,
    redirect_uri: params.redirectUri,
  });

  if (status < 200 || status >= 300) {
    throw failureFrom(status, body, 'Could not complete the login');
  }

  return tokensFrom(body);
}

/**
 * Trade a refresh token for a new access token. When the server rotates refresh
 * tokens the new one is returned; otherwise the presented one is carried
 * forward so callers can persist a complete credential either way.
 */
export async function refreshAccessToken(
  refreshToken: string,
  endpointOverrides?: OAuthEndpoints,
): Promise<OAuthTokens> {
  // Discovery matters most here: refresh runs for months after a login, long
  // after any endpoint compiled into this binary could have moved.
  const endpoints = endpointOverrides ?? (await resolveOAuthEndpoints());

  const { status, body } = await postForm(endpoints.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: endpoints.clientId,
  });

  if (status < 200 || status >= 300) {
    throw failureFrom(status, body, 'Could not refresh the access token');
  }

  return tokensFrom(body, refreshToken);
}

/**
 * Revoke a refresh token server-side. Callers treat failure as a warning: the
 * user's intent on `mux logout` is to stop using the credential locally, which
 * happens regardless.
 */
export async function revokeRefreshToken(
  refreshToken: string,
  endpointOverrides?: OAuthEndpoints,
): Promise<void> {
  const endpoints = endpointOverrides ?? (await resolveOAuthEndpoints());

  const { status, body } = await postForm(endpoints.revocationUrl, {
    token: refreshToken,
    token_type_hint: 'refresh_token',
    client_id: endpoints.clientId,
  });

  if (status < 200 || status >= 300) {
    throw failureFrom(status, body, 'Could not revoke the refresh token');
  }
}
