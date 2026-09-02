import Mux from '@mux/ts';
import pkg from '../../package.json';
import {
  type Environment,
  getCurrentEnvironment,
  readConfig,
} from './config.ts';
import { hasJsonFlag, isAgentMode } from './context.ts';

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
function noticeEnvCredentialsShadowStoredLogin(): void {
  if (envCredentialNoticeShown || isAgentMode() || hasJsonFlag()) return;
  envCredentialNoticeShown = true;
  console.error(
    'Using MUX_TOKEN_ID/MUX_TOKEN_SECRET from environment variables; they take precedence over the stored login.',
  );
}

/**
 * Resolve API credentials.
 * Priority: MUX_TOKEN_ID/MUX_TOKEN_SECRET env vars > stored config
 * (consistent with how MUX_BASE_URL takes precedence over config).
 * Env vars are only used when both are set and non-empty.
 */
async function resolveCredentials(): Promise<{
  tokenId: string;
  tokenSecret: string;
  baseUrl: string;
}> {
  const env = await getCurrentEnvironment();

  const envTokenId = process.env.MUX_TOKEN_ID;
  const envTokenSecret = process.env.MUX_TOKEN_SECRET;
  if (envTokenId && envTokenSecret) {
    if (env) {
      noticeEnvCredentialsShadowStoredLogin();
    }
    return {
      tokenId: envTokenId,
      tokenSecret: envTokenSecret,
      // The base URL follows the credential source: env var credentials
      // never inherit a stored environment's host (MUX_BASE_URL or default).
      baseUrl: getMuxBaseUrl(null),
    };
  }

  if (!env) {
    throw new Error(NOT_LOGGED_IN_MESSAGE);
  }

  return {
    tokenId: env.environment.tokenId,
    tokenSecret: env.environment.tokenSecret,
    baseUrl: getMuxBaseUrl(env),
  };
}

export interface ActiveEnvironment {
  /** Identifier that keys locally stored data (webhook events, signing secrets). */
  environmentId: string;
  /** Where the active credentials came from. */
  source: 'env' | 'config';
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
  const matches = (environment: Environment) =>
    environment.tokenId === tokenId && environment.tokenSecret === tokenSecret;

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
    return {
      environmentId: stored.environment.environmentId ?? stored.name,
      source: 'config',
      baseUrl: getMuxBaseUrl(stored),
      stored,
    };
  }

  if (stored) {
    noticeEnvCredentialsShadowStoredLogin();
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
  const { tokenId, tokenSecret, baseUrl } = await resolveCredentials();

  const credentials = btoa(`${tokenId}:${tokenSecret}`);
  return {
    headers: {
      Authorization: `Basic ${credentials}`,
      'User-Agent': getUserAgent(),
    },
    baseUrl,
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
  const { tokenId, tokenSecret, baseUrl } = await resolveCredentials();

  return new Mux({
    tokenId,
    tokenSecret,
    ...(baseUrl !== DEFAULT_BASE_URL && { baseURL: baseUrl }),
    defaultHeaders: { 'User-Agent': getUserAgent() },
  });
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
