import Mux from '@mux/mux-node';
import pkg from '../../package.json';
import { createBearerRetryFetch } from './bearer-retry.ts';
import {
  type Environment,
  getCurrentEnvironment,
  getEnvironment,
  getEnvironmentAuthType,
  readConfig,
} from './config.ts';
import { hasJsonFlag, isAgentMode } from './context.ts';
import { getPreferredCredential, hasTokenPair } from './credentials.ts';
import {
  ensureFreshAccessToken,
  refreshEnvironmentTokens,
} from './token-refresh.ts';

export const DEFAULT_BASE_URL = 'https://api.mux.com';

function getUserAgent(): string {
  return isAgentMode()
    ? `Mux CLI (agent)/${pkg.version}`
    : `Mux CLI/${pkg.version}`;
}

/**
 * Resolve the Mux API base URL.
 * Priority: MUX_BASE_URL env var > config baseUrl > default
 */
export function getMuxBaseUrl(
  env?: { environment: { baseUrl?: string } } | null,
): string {
  return (
    process.env.MUX_BASE_URL || env?.environment.baseUrl || DEFAULT_BASE_URL
  );
}

export const NOT_LOGGED_IN_MESSAGE =
  "Not logged in. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables, or run 'mux login' to authenticate.";

let envCredentialNoticeShown = false;

/** Reset the one-time env credential notice. Intended for tests. */
export function resetEnvCredentialNotice(): void {
  envCredentialNoticeShown = false;
}

/**
 * Warn once per process when env var credentials shadow a stored login, so
 * a forgotten shell variable does not silently switch accounts. Suppressed
 * in agent mode and when --json was passed, where output (including stderr
 * errors) must stay machine-readable.
 */
function noticeEnvCredentialsShadowStoredLogin(storedName?: string): void {
  if (envCredentialNoticeShown || isAgentMode() || hasJsonFlag()) return;
  envCredentialNoticeShown = true;
  const target = storedName ? ` "${storedName}"` : '';
  console.error(
    `Using MUX_TOKEN_ID/MUX_TOKEN_SECRET from environment variables; they take precedence over the stored login${target}. Run 'mux auth status' for details.`,
  );
}

/**
 * The credentials a request should carry. Discriminated so that the two
 * supported authentication schemes — Basic for Mux API access tokens, Bearer for
 * OAuth logins — flow through one resolution path.
 */
export type ResolvedCredentials =
  | {
      kind: 'token';
      tokenId: string;
      tokenSecret: string;
      baseUrl: string;
      source: 'env' | 'config';
    }
  | {
      kind: 'oauth';
      accessToken: string;
      baseUrl: string;
      source: 'config';
      /** The stored environment name, for error messages. */
      environmentName: string;
    };

/**
 * Resolve API credentials.
 * Priority: MUX_TOKEN_ID/MUX_TOKEN_SECRET env vars > stored config
 * (consistent with how MUX_BASE_URL takes precedence over config).
 * Env vars are only used when both are set and non-empty.
 *
 * An expiring OAuth access token is refreshed here, so no caller needs to know
 * that access tokens have a lifetime.
 */
async function resolveCredentials(): Promise<ResolvedCredentials> {
  const env = await getCurrentEnvironment();

  const envTokenId = process.env.MUX_TOKEN_ID;
  const envTokenSecret = process.env.MUX_TOKEN_SECRET;
  if (envTokenId && envTokenSecret) {
    if (env) {
      noticeEnvCredentialsShadowStoredLogin(env.name);
    }
    return {
      kind: 'token',
      tokenId: envTokenId,
      tokenSecret: envTokenSecret,
      // The base URL follows the credential source: env var credentials
      // never inherit a stored environment's host (MUX_BASE_URL or default).
      baseUrl: getMuxBaseUrl(null),
      source: 'env',
    };
  }

  if (!env) {
    throw new Error(NOT_LOGGED_IN_MESSAGE);
  }

  // OAuth is preferred when an environment holds both, and the token pair is
  // the fallback when an OAuth login has been flagged as failing.
  const preferred = getPreferredCredential(env.environment);
  if (!preferred) {
    throw new Error(
      `Environment "${env.name}" has no usable credentials. Run 'mux login' to sign in again.`,
    );
  }

  if (preferred.kind === 'oauth') {
    const fresh = await ensureFreshAccessToken(env.name, preferred.oauth);
    return {
      kind: 'oauth',
      accessToken: fresh.accessToken,
      baseUrl: getMuxBaseUrl(env),
      source: 'config',
      environmentName: env.name,
    };
  }

  return {
    kind: 'token',
    tokenId: preferred.token.tokenId,
    tokenSecret: preferred.token.tokenSecret,
    baseUrl: getMuxBaseUrl(env),
    source: 'config',
  };
}

/**
 * Force-refresh the stored OAuth login for `name` and return the new access
 * token. Used by the reactive 401 path, where the stored expiry looked fine.
 */
async function refreshActiveAccessToken(name: string): Promise<string> {
  const environment = await getEnvironment(name);
  if (!environment?.oauth) {
    throw new Error(`Environment "${name}" has no OAuth login to refresh.`);
  }
  const refreshed = await refreshEnvironmentTokens(name, environment.oauth);
  return refreshed.accessToken;
}

/**
 * Force-refresh the active stored OAuth login, if there is one. Returns false
 * when the active credentials are not an OAuth login, so callers can tell
 * "nothing to refresh" from "refreshed".
 *
 * Long-lived commands (`webhooks listen`) use this on a mid-stream 401: the
 * server has invalidated a token the CLI still considered fresh.
 */
export async function refreshActiveOAuthCredentials(): Promise<boolean> {
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
    return false;
  }

  const current = await getCurrentEnvironment();
  if (!current?.environment.oauth) {
    return false;
  }

  await refreshEnvironmentTokens(current.name, current.environment.oauth);
  return true;
}

/** The Authorization header value for resolved credentials. */
function authorizationHeader(credentials: ResolvedCredentials): string {
  return credentials.kind === 'oauth'
    ? `Bearer ${credentials.accessToken}`
    : `Basic ${btoa(`${credentials.tokenId}:${credentials.tokenSecret}`)}`;
}

export interface ActiveEnvironment {
  /** Identifier that keys locally stored data (webhook events, signing secrets). */
  environmentId: string;
  /** Where the active credentials came from. */
  source: 'env' | 'config';
  /** Which authentication scheme the active credentials use. */
  kind: 'oauth' | 'token';
  /** API host, resolved from the same source as the credentials. */
  baseUrl: string;
  /**
   * The stored config environment, only when it matches the active
   * credentials. Null when credentials come from env vars that point to a
   * different environment (or no environment is stored) — persisting API
   * results to the stored config would desync it from the environment the
   * credentials actually operate on.
   */
  stored: { name: string; environment: Environment } | null;
}

/**
 * Find the stored environment matching an environment id, checking every
 * named environment, not just the current one. Prefers the current
 * environment when it matches, since the same environment can be saved
 * under multiple names.
 */
async function findStoredEnvironmentById(
  environmentId: string,
  current: { name: string; environment: Environment } | null,
): Promise<{ name: string; environment: Environment } | null> {
  if (current?.environment.environmentId === environmentId) {
    return current;
  }

  const config = await readConfig();
  if (!config) return null;

  for (const [name, environment] of Object.entries(config.environments)) {
    if (environment.environmentId === environmentId) {
      return { name, environment };
    }
  }

  return null;
}

/**
 * Find the stored environment holding exactly these credentials, checking
 * every named environment. Prefers the current environment when it matches.
 * Byte-identical credentials cannot belong to a different environment than
 * the stored entry that holds them, so a match lets callers skip the
 * /whoami round-trip.
 */
async function findStoredEnvironmentByCredentials(
  tokenId: string,
  tokenSecret: string,
  current: { name: string; environment: Environment } | null,
): Promise<{ name: string; environment: Environment } | null> {
  // Matches the token pair wherever it is stored, including on an environment
  // that also holds an OAuth login.
  const matches = (environment: Environment) =>
    hasTokenPair(environment) &&
    environment.token?.tokenId === tokenId &&
    environment.token?.tokenSecret === tokenSecret;

  if (current && matches(current.environment)) {
    return current;
  }

  const config = await readConfig();
  if (!config) return null;

  for (const [name, environment] of Object.entries(config.environments)) {
    if (matches(environment)) {
      return { name, environment };
    }
  }

  return null;
}

/**
 * Resolve the identity of the environment the active credentials operate on.
 * When credentials come from env vars, the environment id is confirmed via
 * /whoami; a stored config environment is returned only when one matches.
 */
export async function resolveActiveEnvironment(): Promise<ActiveEnvironment> {
  const stored = await getCurrentEnvironment();

  const envTokenId = process.env.MUX_TOKEN_ID;
  const envTokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!(envTokenId && envTokenSecret)) {
    if (!stored) {
      throw new Error(NOT_LOGGED_IN_MESSAGE);
    }
    // An OAuth login already knows its own environment (the authorization
    // server bound the token to one), so this resolves with no /whoami
    // round-trip and local-only commands keep working offline.
    return {
      environmentId: stored.environment.environmentId ?? stored.name,
      source: 'config',
      kind: getEnvironmentAuthType(stored.environment),
      baseUrl: getMuxBaseUrl(stored),
      stored,
    };
  }

  if (stored) {
    noticeEnvCredentialsShadowStoredLogin(stored.name);
  }

  // The base URL follows the credential source: env var credentials never
  // inherit a stored environment's host (MUX_BASE_URL or default).
  const baseUrl = getMuxBaseUrl(null);

  // When the env vars hold the same credentials as a stored environment,
  // that environment's identity is already known — skip the /whoami
  // round-trip so local-only commands (sign, webhooks events list) keep
  // working offline.
  const sameCredentials = await findStoredEnvironmentByCredentials(
    envTokenId,
    envTokenSecret,
    stored,
  );
  if (sameCredentials?.environment.environmentId) {
    return {
      environmentId: sameCredentials.environment.environmentId,
      source: 'env',
      kind: 'token',
      baseUrl,
      stored: sameCredentials,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/system/v1/whoami`, {
      headers: {
        Authorization: `Basic ${btoa(`${envTokenId}:${envTokenSecret}`)}`,
        'User-Agent': getUserAgent(),
      },
    });
  } catch (error) {
    throw new Error(
      `Could not verify MUX_TOKEN_ID/MUX_TOKEN_SECRET credentials: failed to reach ${baseUrl} (${error instanceof Error ? error.message : String(error)}). Check your network connection and MUX_BASE_URL.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Could not verify MUX_TOKEN_ID/MUX_TOKEN_SECRET credentials: ${response.status} ${response.statusText}. Check the values or run 'mux login'.`,
    );
  }

  let body: { data?: { environment_id?: string } };
  try {
    body = (await response.json()) as { data?: { environment_id?: string } };
  } catch {
    throw new Error(
      `Could not verify MUX_TOKEN_ID/MUX_TOKEN_SECRET credentials: ${baseUrl} returned a non-JSON response. Check MUX_BASE_URL.`,
    );
  }
  const environmentId = body?.data?.environment_id;
  if (!environmentId) {
    throw new Error(
      'Could not determine the environment for the MUX_TOKEN_ID/MUX_TOKEN_SECRET credentials.',
    );
  }

  // A stored entry holding these exact credentials IS this environment,
  // even when the entry predates environmentId stamping (legacy config):
  // whoami just resolved which environment those credentials belong to.
  const storedMatch =
    (await findStoredEnvironmentById(environmentId, stored)) ?? sameCredentials;

  return {
    environmentId,
    source: 'env',
    kind: 'token',
    baseUrl,
    stored: storedMatch,
  };
}

/**
 * Get auth headers and base URL in a single config read.
 */
export async function getAuthContext(): Promise<{
  headers: Record<string, string>;
  baseUrl: string;
}> {
  const credentials = await resolveCredentials();

  return {
    headers: {
      Authorization: authorizationHeader(credentials),
      'User-Agent': getUserAgent(),
    },
    baseUrl: credentials.baseUrl,
  };
}

/**
 * Get auth headers for raw fetch requests to Mux API
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return (await getAuthContext()).headers;
}

/**
 * Create an authenticated Mux client from env vars or stored credentials.
 * Throws an error when no credentials are available.
 */
export async function createAuthenticatedMuxClient(): Promise<Mux> {
  const credentials = await resolveCredentials();

  // Exactly one credential kind is passed, and the other is explicitly null.
  // Leaving a field undefined lets the SDK fall back to its own environment
  // variable (MUX_TOKEN_ID/MUX_TOKEN_SECRET, MUX_AUTHORIZATION_TOKEN), and
  // because the SDK builds the bearer header after the Basic one, an unrelated
  // MUX_AUTHORIZATION_TOKEN in the shell would silently override the
  // credentials resolved here.
  const auth =
    credentials.kind === 'oauth'
      ? {
          authorizationToken: credentials.accessToken,
          tokenId: null,
          tokenSecret: null,
          // A token can be revoked server-side while the CLI still considers it
          // fresh; this refreshes once on a 401 and retries.
          fetch: createBearerRetryFetch({
            refresh: () =>
              refreshActiveAccessToken(credentials.environmentName),
          }),
        }
      : {
          tokenId: credentials.tokenId,
          tokenSecret: credentials.tokenSecret,
          authorizationToken: null,
        };

  return new Mux({
    ...auth,
    ...(credentials.baseUrl !== DEFAULT_BASE_URL && {
      baseURL: credentials.baseUrl,
    }),
    defaultHeaders: { 'User-Agent': getUserAgent() },
  });
}

/** Identity of the organization and environment a credential is bound to. */
export interface CredentialIdentity {
  environmentId?: string;
  environmentName?: string;
  environmentType?: string;
  organizationId?: string;
  organizationName?: string;
  permissions?: string[];
}

interface WhoAmIIdentityResponse {
  data?: {
    environment_id?: string;
    environment_name?: string;
    environment_type?: string;
    organization_id?: string;
    organization_name?: string;
    permissions?: string[];
  };
}

/**
 * Confirm an OAuth access token and resolve the identity it is bound to.
 * Called immediately after a token exchange so a login is never stored for an
 * environment the CLI could not verify.
 */
export async function validateAccessToken(
  accessToken: string,
  overrideBaseUrl?: string,
): Promise<
  | { valid: true; identity: CredentialIdentity }
  | { valid: false; error: string }
> {
  const baseUrl = overrideBaseUrl || getMuxBaseUrl(null);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/system/v1/whoami`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': getUserAgent(),
      },
    });
  } catch (error) {
    return {
      valid: false,
      error: `Could not verify the access token: failed to reach ${baseUrl} (${
        error instanceof Error ? error.message : String(error)
      }). Check your network connection and MUX_BASE_URL.`,
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      error: `Could not verify the access token: ${response.status} ${response.statusText}.`,
    };
  }

  let body: WhoAmIIdentityResponse;
  try {
    body = (await response.json()) as WhoAmIIdentityResponse;
  } catch {
    return {
      valid: false,
      error: `Could not verify the access token: ${baseUrl} returned a non-JSON response. Check MUX_BASE_URL.`,
    };
  }

  const data = body.data;
  if (!data?.environment_id) {
    return {
      valid: false,
      error:
        'Could not determine which Mux environment the access token belongs to.',
    };
  }

  return {
    valid: true,
    identity: {
      environmentId: data.environment_id,
      environmentName: data.environment_name,
      environmentType: data.environment_type,
      organizationId: data.organization_id,
      organizationName: data.organization_name,
      permissions: data.permissions,
    },
  };
}

/**
 * Validate Mux credentials by making a simple API call.
 * On success, also returns the environment ID from /whoami.
 */
export async function validateCredentials(
  tokenId: string,
  tokenSecret: string,
  overrideBaseUrl?: string,
): Promise<{ valid: boolean; environmentId?: string; error?: string }> {
  try {
    const baseUrl =
      overrideBaseUrl || getMuxBaseUrl(await getCurrentEnvironment());
    const credentials = btoa(`${tokenId}:${tokenSecret}`);
    const response = await fetch(`${baseUrl}/system/v1/whoami`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        'User-Agent': getUserAgent(),
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          valid: false,
          error:
            'Invalid credentials. Verify your Token ID and Secret here: https://dashboard.mux.com/settings/access-tokens',
        };
      }
      if (response.status === 403) {
        return {
          valid: false,
          error:
            'Access forbidden. Your credentials may not have the required permissions.',
        };
      }
      return {
        valid: false,
        error: `Failed to validate credentials: ${response.status} ${response.statusText}`,
      };
    }

    const body = (await response.json()) as {
      data: { environment_id?: string };
    };

    return {
      valid: true,
      environmentId: body.data.environment_id,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        valid: false,
        error: `Failed to validate credentials: ${error.message}`,
      };
    }

    return {
      valid: false,
      error: 'An unknown error occurred while validating credentials.',
    };
  }
}
