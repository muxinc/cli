import Mux from '@mux/mux-node';
import pkg from '../../package.json';
import { getCurrentEnvironment } from './config.ts';
import { isAgentMode } from './context.ts';

export const DEFAULT_BASE_URL = 'https://api.mux.com';

function getUserAgent(): string {
  return isAgentMode()
    ? `Mux CLI (agent)/${pkg.version}`
    : `Mux CLI/${pkg.version}`;
}

/**
 * Resolve the Mux API base URL.
 * Priority: MUX_BASE_URL env var > config baseUrl > default
 * Pass a pre-fetched environment to avoid redundant config reads.
 */
export function resolveBaseUrl(
  env?: { environment: { baseUrl?: string } } | null,
): string {
  return (
    process.env.MUX_BASE_URL || env?.environment.baseUrl || DEFAULT_BASE_URL
  );
}

/**
 * Get the Mux API base URL (reads config if needed).
 */
export async function getMuxBaseUrl(): Promise<string> {
  const env = await getCurrentEnvironment();
  return resolveBaseUrl(env);
}

/**
 * Get auth headers for raw fetch requests to Mux API
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const env = await getCurrentEnvironment();
  if (!env) {
    throw new Error("Not logged in. Please run 'mux login' to authenticate.");
  }

  const credentials = btoa(
    `${env.environment.tokenId}:${env.environment.tokenSecret}`,
  );
  return {
    Authorization: `Basic ${credentials}`,
    'User-Agent': getUserAgent(),
  };
}

/**
 * Create an authenticated Mux client using stored credentials
 * Throws an error if not logged in
 */
export async function createAuthenticatedMuxClient(): Promise<Mux> {
  const env = await getCurrentEnvironment();
  if (!env) {
    throw new Error("Not logged in. Please run 'mux login' to authenticate.");
  }

  const baseURL = resolveBaseUrl(env);

  return new Mux({
    tokenId: env.environment.tokenId,
    tokenSecret: env.environment.tokenSecret,
    ...(baseURL !== DEFAULT_BASE_URL && { baseURL }),
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
    const baseUrl = overrideBaseUrl || (await getMuxBaseUrl());
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
