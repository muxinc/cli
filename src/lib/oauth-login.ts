import { openBrowser as defaultOpenBrowser } from './browser.ts';
import {
  type Environment,
  findEnvironmentByEnvironmentId,
  getEnvironment,
  listEnvironments,
  type OAuthCredentials,
  removeEnvironment,
  setCredential,
  setCurrentEnvironment,
  updateEnvironment,
} from './config.ts';
import {
  type CredentialIdentity,
  validateAccessToken as defaultValidateAccessToken,
  getMuxBaseUrl,
} from './mux.ts';
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens as defaultExchange,
  getServerCapabilities,
  type OAuthEndpoints,
  OAuthError,
  type OAuthTokens,
  resolveOAuthEndpoints,
} from './oauth.ts';
import {
  startLoopbackServer as defaultStartServer,
  type LoopbackServer,
  type StartLoopbackOptions,
} from './oauth-loopback.ts';
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce.ts';

/**
 * Orchestration for a browser-based login: PKCE, loopback redirect, token
 * exchange, identity verification, and storage.
 *
 * Every external step is injectable so the flow can be tested without a browser
 * or a network, and so the command layer owns all terminal output.
 */

export interface OAuthLoginOptions {
  /** Override the derived environment name. */
  name?: string;
  /** Force a specific loopback port. */
  port?: number;
  /** Print the authorization URL instead of opening a browser. */
  noBrowser?: boolean;
  /** Make this the active environment. Defaults to true. */
  activate?: boolean;
  /** API host for identity verification. Defaults to the resolved Mux base URL. */
  baseUrl?: string;
}

export interface OAuthLoginDeps {
  startServer?: (options: StartLoopbackOptions) => Promise<LoopbackServer>;
  openBrowser?: (url: string) => Promise<boolean>;
  exchange?: (params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    endpoints?: OAuthEndpoints;
  }) => Promise<OAuthTokens>;
  /** Skip endpoint resolution (and therefore discovery) entirely. */
  endpoints?: OAuthEndpoints;
  validate?: (
    accessToken: string,
    baseUrl?: string,
  ) => Promise<
    | { valid: true; identity: CredentialIdentity }
    | { valid: false; error: string }
  >;
  /**
   * Called once the authorization URL is known, with whether a browser was
   * opened. The command layer prints it.
   */
  onAuthorizationUrl?: (url: string, opened: boolean) => void;
}

export interface OAuthLoginResult {
  /** The environment name the login was stored under. */
  name: string;
  /** The stored entry as it now stands, including any access token pair kept. */
  environment: Environment;
  identity: CredentialIdentity;
  /** Whether this login became the active environment. */
  activated: boolean;
  /** True when an existing entry for the same environment was updated. */
  replacedExisting: boolean;
}

/**
 * Check what the authorization server advertises, when discovery told us.
 *
 * Both checks fail (or warn) at login, where the user can act on it, rather than
 * surfacing as a confusing error at exchange time or hours later on the first
 * refresh. Silence here means discovery was unavailable — nothing is asserted
 * about a server we could not ask.
 */
function assertServerSupportsFlow(requestedScopes: string[]): void {
  const { codeChallengeMethods, grantTypes, scopes } = getServerCapabilities();

  if (requestedScopes.length === 0) {
    throw new OAuthError(
      'No OAuth scopes are configured, and the Mux authorization server requires at least one. Set MUX_OAUTH_SCOPES, or report this as a bug in the CLI.',
      { terminal: true, code: 'no_scopes' },
    );
  }

  if (scopes) {
    // A scope the server does not offer is either a typo or drift between the
    // CLI and the server. Warn rather than fail: the server decides what to
    // grant, and refusing to log in over an extra scope would be worse.
    const unsupported = requestedScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    if (unsupported.length > 0) {
      console.error(
        `Warning: requesting ${unsupported.join(
          ', ',
        )}, which the Mux authorization server does not list as supported. The login may be rejected, or granted fewer permissions than expected.`,
      );
    }
  }

  if (codeChallengeMethods && !codeChallengeMethods.includes('S256')) {
    throw new OAuthError(
      `The Mux authorization server does not advertise support for PKCE S256 (only ${codeChallengeMethods.join(
        ', ',
      )}). This CLI will not fall back to a weaker method; please report this.`,
      { terminal: true, code: 'pkce_unsupported' },
    );
  }

  if (grantTypes && !grantTypes.includes('refresh_token')) {
    // Not fatal: the login still works, it just will not renew itself.
    console.error(
      'Warning: the Mux authorization server does not advertise the refresh_token grant. This login will stop working when its access token expires, and you will need to run `mux login` again.',
    );
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a local name for a login. Collisions get a numeric suffix: two
 * different Mux environments must never share one config entry.
 */
export function deriveEnvironmentName(params: {
  organizationName?: string;
  environmentName?: string;
  environmentId?: string;
  taken: string[];
}): string {
  const parts = [params.organizationName, params.environmentName]
    .filter((part): part is string => Boolean(part?.trim()))
    .map(slugify)
    .filter(Boolean);

  const base =
    parts.join('-') || slugify(params.environmentId ?? '') || 'default';
  // Preserve the environment id verbatim when it is the only identifier: it is
  // already unique and slugifying would mangle it.
  const candidate =
    parts.length === 0 && params.environmentId ? params.environmentId : base;

  const taken = new Set(params.taken);
  if (!taken.has(candidate)) return candidate;

  let suffix = 2;
  while (taken.has(`${candidate}-${suffix}`)) {
    suffix += 1;
  }
  return `${candidate}-${suffix}`;
}

export async function performOAuthLogin(
  options: OAuthLoginOptions,
  deps: OAuthLoginDeps = {},
): Promise<OAuthLoginResult> {
  const startServer = deps.startServer ?? defaultStartServer;
  const openBrowser = deps.openBrowser ?? defaultOpenBrowser;
  const exchange = deps.exchange ?? defaultExchange;
  const validate = deps.validate ?? defaultValidateAccessToken;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const state = generateState();

  const server = await startServer({
    state,
    ...(options.port !== undefined && { port: options.port }),
  });

  let tokens: OAuthTokens;
  try {
    // Resolved once, then used for both legs: the authorization request and the
    // token exchange must agree, and the server may have moved an endpoint.
    const endpoints =
      deps.endpoints ?? (await resolveOAuthEndpoints(options.baseUrl));
    assertServerSupportsFlow(endpoints.scopes);

    const authorizationUrl = buildAuthorizationUrl({
      codeChallenge,
      state,
      redirectUri: server.redirectUri,
      endpoints,
    });

    const opened = options.noBrowser
      ? false
      : await openBrowser(authorizationUrl).catch(() => false);
    deps.onAuthorizationUrl?.(authorizationUrl, opened);

    const code = await server.waitForCode();
    tokens = await exchange({
      code,
      codeVerifier,
      redirectUri: server.redirectUri,
      endpoints,
    });
  } finally {
    // The listener holds an authorization code path open; close it on every
    // exit, not just the successful one.
    server.stop();
  }

  const baseUrl = options.baseUrl ?? getMuxBaseUrl(null);
  const verification = await validate(tokens.accessToken, baseUrl);
  if (!verification.valid) {
    // Nothing is written: a login stored for an unverified environment would
    // desync the config from the credential it holds.
    throw new Error(verification.error);
  }
  const identity = verification.identity;

  const existing = identity.environmentId
    ? await findEnvironmentByEnvironmentId(identity.environmentId)
    : null;

  const name =
    options.name ??
    existing?.name ??
    deriveEnvironmentName({
      organizationName: identity.organizationName,
      environmentName: identity.environmentName,
      environmentId: identity.environmentId,
      taken: await listEnvironments(),
    });

  const oauth: OAuthCredentials = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
    ...(tokens.scope && { scope: tokens.scope }),
  };

  // Identity comes from the grant; the rest of the entry — signing keys, forward
  // URL, base URL, and any access token pair saved for this same environment —
  // is left exactly as it was. An environment can be reachable both ways.
  await setCredential(name, 'oauth', oauth, {
    ...(identity.environmentId && { environmentId: identity.environmentId }),
    ...(identity.environmentName && {
      environmentName: identity.environmentName,
    }),
    ...(identity.organizationId && { organizationId: identity.organizationId }),
    ...(identity.organizationName && {
      organizationName: identity.organizationName,
    }),
    ...(options.baseUrl && { baseUrl: options.baseUrl }),
  });

  // An explicit --name that points somewhere else would leave a second entry for
  // the same environment behind. Move the old entry's environment-bound state
  // and credentials across, then drop it, so one environment maps to one entry.
  if (existing && existing.name !== name) {
    await updateEnvironment(name, {
      ...(existing.environment.signingKeyId && {
        signingKeyId: existing.environment.signingKeyId,
      }),
      ...(existing.environment.signingPrivateKey && {
        signingPrivateKey: existing.environment.signingPrivateKey,
      }),
      ...(existing.environment.forwardUrl && {
        forwardUrl: existing.environment.forwardUrl,
      }),
      // The host binding is environment-bound too: dropping it would silently
      // revert a staging or self-hosted environment to the default API host.
      ...(existing.environment.baseUrl && {
        baseUrl: existing.environment.baseUrl,
      }),
      ...(existing.environment.token && { token: existing.environment.token }),
    });
    await removeEnvironment(existing.name);
  }

  const environment = (await getEnvironment(name)) ?? { oauth };

  const activate = options.activate !== false;
  if (activate) {
    await setCurrentEnvironment(name);
  }

  return {
    name,
    environment,
    identity,
    activated: activate,
    replacedExisting: Boolean(existing),
  };
}
