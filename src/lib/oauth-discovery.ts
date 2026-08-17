import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCacheDir } from './xdg.ts';

/**
 * Authorization server metadata discovery (RFC 8414, and the OIDC discovery
 * document as a fallback).
 *
 * A CLI binary can sit on a machine for years. Endpoints compiled into it break
 * permanently if they ever move — and worse for refresh than for login, since
 * refresh runs long after install. Discovery lets the server move without
 * stranding old installs.
 *
 * It is deliberately an *upgrade path, never a dependency*: any failure here
 * returns null and callers keep their built-in defaults. A discovery outage must
 * not stop anyone from logging in.
 */

/** Tried in order. RFC 8414 defines revocation_endpoint; OIDC Core does not. */
const WELL_KNOWN_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
];

/** Hosts whose endpoints are trusted, besides the discovery document's own origin. */
const TRUSTED_HOST_SUFFIX = 'mux.com';

export const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 5000;

export interface DiscoveredEndpoints {
  authorizationUrl?: string;
  tokenUrl?: string;
  revocationUrl?: string;
  grantTypes?: string[];
  codeChallengeMethods?: string[];
  scopes?: string[];
  /** Where this came from, for diagnostics. */
  discoveredFrom: string;
}

interface DiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  revocation_endpoint?: string;
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
}

interface CacheEntry {
  fetchedAt: number;
  baseUrl: string;
  endpoints: DiscoveredEndpoints;
}

export function getDiscoveryCachePath(): string {
  return join(getCacheDir(), 'oauth-discovery.json');
}

/** The well-known URLs for an API base, in the order they should be tried. */
export function getDiscoveryUrls(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return WELL_KNOWN_PATHS.map((path) => `${trimmed}${path}`);
}

/**
 * Accept an endpoint only if it is trustworthy: https on a Mux host, or on the
 * exact origin the discovery document itself came from.
 *
 * Without this, a compromised or misconfigured document could repoint the token
 * endpoint and collect authorization codes and refresh tokens.
 */
export function validateEndpoint(
  endpoint: string,
  discoveredFrom: string,
): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  // Same origin as the document: it is exactly as trustworthy as the host the
  // document came from, which is also what makes local and staging servers work
  // through MUX_BASE_URL alone.
  try {
    if (url.origin === new URL(discoveredFrom).origin) {
      return url.toString();
    }
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  // Suffix match on a dot boundary: `notmux.com` and `mux.com.evil.test` must
  // not pass.
  if (
    host !== TRUSTED_HOST_SUFFIX &&
    !host.endsWith(`.${TRUSTED_HOST_SUFFIX}`)
  ) {
    return null;
  }

  return url.toString();
}

async function readCache(baseUrl: string): Promise<DiscoveredEndpoints | null> {
  try {
    const entry = JSON.parse(
      await readFile(getDiscoveryCachePath(), 'utf-8'),
    ) as CacheEntry;

    if (entry.baseUrl !== baseUrl) return null;
    if (Date.now() - entry.fetchedAt > DISCOVERY_CACHE_TTL_MS) return null;
    if (!entry.endpoints) return null;

    return entry.endpoints;
  } catch {
    // Missing, unreadable, or malformed: just refetch.
    return null;
  }
}

async function writeCache(
  baseUrl: string,
  endpoints: DiscoveredEndpoints,
): Promise<void> {
  try {
    await mkdir(getCacheDir(), { recursive: true });
    await writeFile(
      getDiscoveryCachePath(),
      JSON.stringify({ fetchedAt: Date.now(), baseUrl, endpoints }, null, 2),
    );
  } catch {
    // A cache we cannot write is not a reason to fail a login.
  }
}

export async function clearDiscoveryCache(): Promise<void> {
  await unlink(getDiscoveryCachePath()).catch(() => {});
}

/** Map a document onto endpoints, dropping any that fail validation. */
function endpointsFrom(
  document: DiscoveryDocument,
  discoveredFrom: string,
): DiscoveredEndpoints | null {
  const authorizationUrl = document.authorization_endpoint
    ? validateEndpoint(document.authorization_endpoint, discoveredFrom)
    : null;
  const tokenUrl = document.token_endpoint
    ? validateEndpoint(document.token_endpoint, discoveredFrom)
    : null;
  const revocationUrl = document.revocation_endpoint
    ? validateEndpoint(document.revocation_endpoint, discoveredFrom)
    : null;

  // A document that yields no usable endpoint is worse than useless: treat it as
  // absent so the caller's defaults apply.
  if (!authorizationUrl && !tokenUrl && !revocationUrl) {
    return null;
  }

  return {
    ...(authorizationUrl && { authorizationUrl }),
    ...(tokenUrl && { tokenUrl }),
    ...(revocationUrl && { revocationUrl }),
    ...(Array.isArray(document.grant_types_supported) && {
      grantTypes: document.grant_types_supported,
    }),
    ...(Array.isArray(document.code_challenge_methods_supported) && {
      codeChallengeMethods: document.code_challenge_methods_supported,
    }),
    ...(Array.isArray(document.scopes_supported) && {
      scopes: document.scopes_supported,
    }),
    discoveredFrom,
  };
}

/**
 * Resolve authorization server endpoints for an API base URL, using a cached
 * document when one is fresh. Returns null when discovery is unavailable for any
 * reason, which callers treat as "use the built-in defaults".
 */
export async function discoverEndpoints(
  baseUrl: string,
): Promise<DiscoveredEndpoints | null> {
  const cached = await readCache(baseUrl);
  if (cached) return cached;

  for (const url of getDiscoveryUrls(baseUrl)) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      continue;
    }

    if (!response.ok) continue;

    let document: DiscoveryDocument;
    try {
      document = (await response.json()) as DiscoveryDocument;
    } catch {
      continue;
    }

    const endpoints = endpointsFrom(document, url);
    if (endpoints) {
      await writeCache(baseUrl, endpoints);
      return endpoints;
    }
  }

  return null;
}
