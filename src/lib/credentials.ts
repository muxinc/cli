/**
 * The credential model for a stored Mux environment.
 *
 * One environment can be reachable more than one way: a Mux API access token
 * pair saved for CI, and an OAuth login saved by `mux login`. Both are kept, in
 * separate blocks, and OAuth is preferred when present — OAuth credentials go
 * stale unless they are exercised and refreshed, so quietly living on the token
 * pair would leave a rotting login behind.
 *
 * Credential shape is defined here rather than in config.ts so that reasoning
 * about "which credential" stays separate from reading and writing files.
 */

/** Why a credential last failed in a way retrying will not fix. */
export interface CredentialError {
  /** OAuth error code, HTTP status, or another short machine-readable tag. */
  code: string;
  /** ISO 8601 timestamp. */
  at: string;
  message?: string;
}

/** An OAuth login: bearer access token plus the refresh token that renews it. */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  /** Absolute access token expiry, epoch seconds. */
  expiresAt: number;
  scope?: string;
  tokenType?: 'Bearer';
  lastError?: CredentialError;
}

/** A Mux API access token pair, sent as Basic auth. */
export interface TokenCredentials {
  tokenId: string;
  tokenSecret: string;
  lastError?: CredentialError;
}

/**
 * A stored environment: identity and environment-bound settings, plus whichever
 * credentials are held for it.
 */
export interface Environment {
  /** Mux environment id, the key for environment-scoped local state. */
  environmentId?: string;
  environmentName?: string;
  organizationId?: string;
  organizationName?: string;
  baseUrl?: string;
  signingKeyId?: string;
  signingPrivateKey?: string;
  forwardUrl?: string;
  oauth?: OAuthCredentials;
  token?: TokenCredentials;
}

export type CredentialKind = 'oauth' | 'token';

export type PreferredCredential =
  | { kind: 'oauth'; oauth: OAuthCredentials }
  | { kind: 'token'; token: TokenCredentials };

/** Environment-level fields, i.e. everything that is not a credential block. */
const ENVIRONMENT_FIELDS = [
  'environmentId',
  'environmentName',
  'organizationId',
  'organizationName',
  'baseUrl',
  'signingKeyId',
  'signingPrivateKey',
  'forwardUrl',
] as const;

export function hasOAuth(environment: Environment): boolean {
  return Boolean(environment.oauth?.accessToken);
}

export function hasTokenPair(environment: Environment): boolean {
  return Boolean(environment.token?.tokenId && environment.token?.tokenSecret);
}

/**
 * Read either stored layout into the nested form.
 *
 * Released versions wrote credentials flat (`tokenId` / `tokenSecret` at the top
 * level); this version nests them under `token` so an environment can also hold
 * an OAuth login. Normalizing on read means there is no migration step and no
 * config version to track, and an access token pair keeps working either way —
 * only where it sits in the file changed.
 *
 * The `type` discriminator and flat OAuth fields handled below never appeared in
 * a released build; they are tolerated so that anyone running an intermediate
 * build of this branch is not stranded.
 */
export function normalizeEnvironment(raw: unknown): Environment {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const normalized: Environment = {};

  for (const field of ENVIRONMENT_FIELDS) {
    const value = entry[field];
    if (typeof value === 'string') {
      normalized[field] = value;
    }
  }

  // Already nested: trust the blocks as written.
  if (entry.oauth && typeof entry.oauth === 'object') {
    normalized.oauth = entry.oauth as OAuthCredentials;
  }
  if (entry.token && typeof entry.token === 'object') {
    normalized.token = entry.token as TokenCredentials;
  }

  // Flat token pair. Half a pair authenticates nothing, so both are required.
  if (
    !normalized.token &&
    typeof entry.tokenId === 'string' &&
    typeof entry.tokenSecret === 'string'
  ) {
    normalized.token = {
      tokenId: entry.tokenId,
      tokenSecret: entry.tokenSecret,
    };
  }

  // Flat OAuth credentials, as written by earlier builds of this feature.
  if (
    !normalized.oauth &&
    typeof entry.accessToken === 'string' &&
    typeof entry.refreshToken === 'string'
  ) {
    normalized.oauth = {
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      expiresAt: typeof entry.expiresAt === 'number' ? entry.expiresAt : 0,
      ...(typeof entry.scope === 'string' && { scope: entry.scope }),
      ...(entry.tokenType === 'Bearer' && { tokenType: 'Bearer' as const }),
      ...(entry.lastError && typeof entry.lastError === 'object'
        ? { lastError: entry.lastError as CredentialError }
        : {}),
    };
  }

  return normalized;
}

/**
 * The credential a request should use. OAuth wins, except when it is flagged as
 * failing and a token pair is available to fall back to. A flagged credential
 * that is the only one present is still returned: a real API error is more
 * useful than claiming there are no credentials.
 */
export function getPreferredCredential(
  environment: Environment,
): PreferredCredential | null {
  const oauth = hasOAuth(environment) ? environment.oauth : undefined;
  const token = hasTokenPair(environment) ? environment.token : undefined;

  if (oauth && !(oauth.lastError && token)) {
    return { kind: 'oauth', oauth };
  }
  if (token) {
    return { kind: 'token', token };
  }
  return oauth ? { kind: 'oauth', oauth } : null;
}

/**
 * Record or clear a credential failure. Flagging never deletes the credential:
 * the user decides whether to remove it, and a flagged block still lets
 * `mux auth status` explain what went wrong.
 */
export function flagCredential(
  environment: Environment,
  kind: CredentialKind,
  error: CredentialError | null,
): Environment {
  const block = environment[kind];
  if (!block) return environment;

  const { lastError: _dropped, ...rest } = block;
  return {
    ...environment,
    [kind]: error ? { ...rest, lastError: error } : rest,
  };
}

export interface EnvironmentSummary {
  /** Credential kinds held, preferred first. */
  kinds: CredentialKind[];
  preferred: CredentialKind | null;
  /** "Organization / Environment", or the environment id, for display. */
  identity: string;
  /** A flagged failure worth showing the user. */
  warning?: string;
}

/** Everything `auth status` and `env list` need to render one environment. */
export function summarizeEnvironment(
  environment: Environment,
): EnvironmentSummary {
  const preferred = getPreferredCredential(environment);
  const kinds: CredentialKind[] = [];
  if (preferred) kinds.push(preferred.kind);
  for (const kind of ['oauth', 'token'] as const) {
    const present = kind === 'oauth' ? hasOAuth : hasTokenPair;
    if (present(environment) && !kinds.includes(kind)) kinds.push(kind);
  }

  const identity =
    [environment.organizationName, environment.environmentName]
      .filter(Boolean)
      .join(' / ') ||
    environment.environmentId ||
    '';

  const failing = (['oauth', 'token'] as const).find(
    (kind) => environment[kind]?.lastError,
  );
  const failure = failing ? environment[failing]?.lastError : undefined;

  return {
    kinds,
    preferred: preferred?.kind ?? null,
    identity,
    ...(failure && {
      warning:
        failing === 'oauth'
          ? `OAuth login failed (${failure.code}) — run 'mux login' to sign in again`
          : `Access token failed (${failure.code}) — run 'mux login --interactive' to replace it`,
    }),
  };
}
