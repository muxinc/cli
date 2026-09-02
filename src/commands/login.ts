import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Command } from '@cliffy/command';
import {
  getEnvironment,
  listEnvironments,
  setEnvironment,
} from '../lib/config.ts';
import { wantsJson } from '../lib/context.ts';
import { environmentSettings } from '../lib/credentials.ts';
import { handleCommandError } from '../lib/errors.ts';
import {
  DEFAULT_BASE_URL,
  getMuxBaseUrl,
  validateCredentials,
} from '../lib/mux.ts';
import { type OAuthLoginDeps, performOAuthLogin } from '../lib/oauth-login.ts';
import { DEFAULT_TIMEOUT_MS } from '../lib/oauth-loopback.ts';
import { inputPrompt, secretPrompt } from '../lib/prompt.ts';
import { getConfigPath } from '../lib/xdg.ts';
import { resolveLoginMode } from './login-mode.ts';

export interface EnvVars {
  MUX_TOKEN_ID?: string;
  MUX_TOKEN_SECRET?: string;
  MUX_BASE_URL?: string;
  MUX_SIGNING_KEY?: string;
  MUX_PRIVATE_KEY?: string;
}

/**
 * Parse a .env file and extract MUX_TOKEN_ID and MUX_TOKEN_SECRET
 */
export async function parseEnvFile(filePath: string): Promise<EnvVars> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await readFile(filePath, 'utf-8');
  const envVars: EnvVars = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key === 'MUX_TOKEN_ID') {
        envVars.MUX_TOKEN_ID = value;
      } else if (key === 'MUX_TOKEN_SECRET') {
        envVars.MUX_TOKEN_SECRET = value;
      } else if (key === 'MUX_BASE_URL') {
        envVars.MUX_BASE_URL = value;
      } else if (key === 'MUX_SIGNING_KEY') {
        envVars.MUX_SIGNING_KEY = value;
      } else if (key === 'MUX_PRIVATE_KEY') {
        envVars.MUX_PRIVATE_KEY = value;
      }
    }
  }

  return envVars;
}

/**
 * Read credentials from environment variables.
 * Returns null unless both MUX_TOKEN_ID and MUX_TOKEN_SECRET are set
 * and non-empty.
 */
export function credentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EnvVars | null {
  if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
    return null;
  }

  return {
    MUX_TOKEN_ID: env.MUX_TOKEN_ID,
    MUX_TOKEN_SECRET: env.MUX_TOKEN_SECRET,
    ...(env.MUX_BASE_URL && { MUX_BASE_URL: env.MUX_BASE_URL }),
    ...(env.MUX_SIGNING_KEY &&
      env.MUX_PRIVATE_KEY && {
        MUX_SIGNING_KEY: env.MUX_SIGNING_KEY,
        MUX_PRIVATE_KEY: env.MUX_PRIVATE_KEY,
      }),
  };
}

/**
 * Both interactive login methods need a real terminal: one to prompt on, one to
 * print an authorization URL to and wait. Fail fast rather than hanging on a
 * pipe or a CI runner.
 */
function requireInteractiveTerminal(flag: string): void {
  if (process.stdin.isTTY) return;

  throw new Error(
    `${flag} needs an interactive terminal, and this shell is not one. ` +
      'Use `mux login --env-file <path>`, or set MUX_TOKEN_ID and MUX_TOKEN_SECRET and run `mux login --from-env`.',
  );
}

/**
 * Notice printed after a successful login when shell credentials are set. The
 * saved login has no effect until they are unset, and silently saving something
 * inert is exactly the confusion this is meant to prevent.
 */
function noticeSavedLoginIsShadowed(json: boolean): void {
  if (json || !credentialsFromEnv()) return;

  console.log(
    '\nSaved. Note: MUX_TOKEN_ID/MUX_TOKEN_SECRET are set in this shell and take precedence over the saved login. Unset them to use this login.',
  );
}

/**
 * What to print once the authorization URL is known.
 *
 * The URL is always shown, even when the browser reported success: `open` and
 * `xdg-open` exit 0 whether or not a window actually appeared — wrong default
 * browser, a background profile, a browser still launching — and without the URL
 * on screen the only recovery is Ctrl+C and a second run with --print-url.
 *
 * Returned as lines rather than printed so this stays testable; the command
 * layer owns the writing.
 */
export function formatAuthorizationNotice(
  url: string,
  opened: boolean,
): string[] {
  return [
    opened
      ? 'Opened your browser to continue signing in.'
      : 'Open this URL in your browser to continue signing in:',
    '',
    `  ${url}`,
    '',
    ...(opened ? ["If your browser didn't open, use the URL above."] : []),
    'Waiting for authorization (press Ctrl+C to cancel)...',
  ];
}

/**
 * Run the browser-based OAuth login and report the result. Organization and
 * environment selection happens in the dashboard, so the CLI only reports what
 * came back.
 *
 * Works without a terminal when the caller declared machine-readable intent
 * (--json or agent mode): the flow itself never reads stdin, and the loopback
 * timeout bounds the wait. `deps` is injectable for tests only; the command
 * action always uses the real flow.
 */
export async function runOAuthLogin(
  options: {
    name?: string;
    port?: number;
    printUrl?: boolean;
    keepCurrent?: boolean;
    timeout?: number;
    json?: boolean;
  },
  deps: OAuthLoginDeps = {},
): Promise<void> {
  const json = wantsJson(options);

  // Machine-readable callers relay the authorization URL themselves, so only
  // the default pretty flow insists on a terminal: a bare `mux login` in a
  // pipe or CI runner still fails fast instead of hanging on a redirect.
  if (!json) {
    requireInteractiveTerminal('Browser sign-in');
  }

  if (
    options.timeout !== undefined &&
    (!Number.isFinite(options.timeout) || options.timeout <= 0)
  ) {
    throw new Error('--timeout must be a positive number of seconds.');
  }
  const timeoutMs =
    options.timeout !== undefined ? options.timeout * 1000 : undefined;

  const result = await performOAuthLogin(
    {
      ...(options.name && { name: options.name }),
      ...(options.port !== undefined && { port: options.port }),
      ...(timeoutMs !== undefined && { timeoutMs }),
      noBrowser: options.printUrl === true,
      activate: options.keepCurrent !== true,
    },
    {
      ...deps,
      onAuthorizationUrl: (url, opened) => {
        if (json) {
          // Progress goes to stderr as a JSON line so stdout stays a single
          // parseable document. Emitted the moment the URL is known, so a
          // caller polling the stream can relay it before the flow blocks.
          console.error(
            JSON.stringify({
              event: 'authorization_url',
              url,
              browserOpened: opened,
              expiresInSeconds: Math.round(
                (timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000,
              ),
            }),
          );
          return;
        }
        for (const line of formatAuthorizationNotice(url, opened)) {
          console.log(line);
        }
      },
    },
  );

  if (json) {
    console.log(
      JSON.stringify(
        {
          name: result.name,
          identity: result.identity,
          activated: result.activated,
          replacedExisting: result.replacedExisting,
          dropped: result.dropped,
        },
        null,
        2,
      ),
    );
    return;
  }

  const { identity } = result;
  const org = identity.organizationName ?? identity.organizationId ?? 'unknown';
  const env = identity.environmentName ?? identity.environmentId ?? 'unknown';

  // No config path: where credentials live is not something a user acts on at
  // sign-in time, and `mux auth status` answers it when they do want to know.
  const id = identity.environmentId ? ` (${identity.environmentId})` : '';
  console.log(`\n✅ Signed in to ${org} / ${env}${id}`);

  // Losing a signing key or an access token pair must never be silent, and an
  // access token secret cannot be recovered from the dashboard after creation.
  if (result.dropped.length > 0) {
    console.log(
      `\n⚠️  "${result.name}" previously held a different Mux environment, so its ${result.dropped.join(
        ', ',
      )} ${result.dropped.length === 1 ? 'was' : 'were'} discarded.`,
    );
  }

  const verb = result.replacedExisting ? 'Updated' : 'Saved as';
  if (result.activated) {
    console.log(
      `✅ ${verb} "${result.name}" and set as the active environment`,
    );
  } else {
    console.log(`✅ ${verb} "${result.name}"`);
    console.log(`   Run 'mux env switch ${result.name}' to use it.`);
  }
  noticeSavedLoginIsShadowed(json);
}

// Explicitly annotated: Cliffy's builder type cannot be named across this many
// chained options without leaking an internal module path into the .d.ts.
export const loginCommand = new Command()
  .description(
    'Sign in to Mux. Opens your browser to select an organization and environment; use --interactive, --env-file, or --from-env for a Mux API access token instead. ' +
      'With --json or in agent mode, the authorization URL is emitted as a JSON event on stderr and the result as JSON on stdout. ' +
      'The browser must be able to reach this machine to complete the sign-in (see --port for SSH port forwarding).',
  )
  .option(
    '-f, --env-file <path:string>',
    'Save credentials from a .env file containing MUX_TOKEN_ID, MUX_TOKEN_SECRET, and optionally MUX_SIGNING_KEY and MUX_PRIVATE_KEY for signed URLs',
  )
  .option(
    '-n, --name <name:string>',
    "Name for this environment (default: derived from the organization and environment for OAuth, or 'default' otherwise)",
  )
  .option(
    '--from-env',
    'Save the MUX_TOKEN_ID and MUX_TOKEN_SECRET already set in this shell',
  )
  .option(
    '--interactive',
    'Enter a Mux API access token (Token ID and Secret) manually',
  )
  .option('--oauth', 'Sign in with a browser (the default)')
  // Named without a `--no-` prefix deliberately: Cliffy's negatable options
  // generate a type that cannot be named under this project's declaration
  // settings, and these read just as clearly as flags to opt into.
  .option(
    '--print-url',
    'Print the authorization URL instead of opening a browser',
  )
  .option('--port <port:number>', 'Local port to receive the login redirect on')
  .option(
    '--timeout <seconds:number>',
    'How long to wait for the browser authorization before giving up (default: 300)',
  )
  .option(
    '--keep-current',
    'Save the login without making it the active environment',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options) => {
    const json = wantsJson(options);
    try {
      // Throws with guidance when the flags conflict, when --from-env has
      // nothing to read, or when shell credentials make the intent ambiguous.
      const mode = resolveLoginMode(options);

      if (mode === 'oauth') {
        await runOAuthLogin(options);
        return;
      }

      let tokenId: string;
      let tokenSecret: string;
      let source: 'env-file' | 'env' | 'interactive';
      let signingKeys:
        | { signingKeyId: string; signingPrivateKey: string }
        | undefined;
      const envName = options.name || 'default';

      // Check if environment already exists
      const existingEnvs = await listEnvironments();
      if (existingEnvs.includes(envName) && !json) {
        console.log(
          `⚠️  Environment "${envName}" already exists. It will be overwritten.`,
        );
      }

      let baseUrl: string;

      if (options.envFile) {
        // Read from .env file
        if (!json) {
          console.log(`Reading credentials from ${options.envFile}...`);
        }

        const envVars = await parseEnvFile(options.envFile);

        if (!envVars.MUX_TOKEN_ID || !envVars.MUX_TOKEN_SECRET) {
          throw new Error(
            'Missing required variables in .env file. Expected: MUX_TOKEN_ID and MUX_TOKEN_SECRET.\n' +
              'Generate API credentials here: https://dashboard.mux.com/settings/access-tokens',
          );
        }

        tokenId = envVars.MUX_TOKEN_ID;
        tokenSecret = envVars.MUX_TOKEN_SECRET;
        // The file is the credential bundle: its MUX_BASE_URL wins over the
        // shell's, so a leftover shell variable cannot silently rebind the
        // file's tokens (and the saved environment) to a different host. The
        // ambient variable or default applies only when the file sets none.
        baseUrl = envVars.MUX_BASE_URL || getMuxBaseUrl(null);
        if (envVars.MUX_SIGNING_KEY && envVars.MUX_PRIVATE_KEY) {
          signingKeys = {
            signingKeyId: envVars.MUX_SIGNING_KEY,
            signingPrivateKey: envVars.MUX_PRIVATE_KEY,
          };
        }
        source = 'env-file';
      } else if (mode === 'from-env') {
        // resolveLoginMode already established that both variables are set.
        const envCredentials = credentialsFromEnv() as NonNullable<
          ReturnType<typeof credentialsFromEnv>
        >;
        // Read from environment variables
        if (!json) {
          console.log(
            'Using MUX_TOKEN_ID and MUX_TOKEN_SECRET from environment variables...',
          );
        }

        tokenId = envCredentials.MUX_TOKEN_ID as string;
        tokenSecret = envCredentials.MUX_TOKEN_SECRET as string;
        baseUrl = getMuxBaseUrl({
          environment: { baseUrl: envCredentials.MUX_BASE_URL },
        });
        if (envCredentials.MUX_SIGNING_KEY && envCredentials.MUX_PRIVATE_KEY) {
          signingKeys = {
            signingKeyId: envCredentials.MUX_SIGNING_KEY,
            signingPrivateKey: envCredentials.MUX_PRIVATE_KEY,
          };
        }
        source = 'env';
      } else {
        // Interactive prompts are not possible in machine-readable mode, nor
        // with no terminal to prompt on; fail fast with recovery guidance
        // instead of blocking on stdin.
        if (json) {
          throw new Error(
            'Manual credential entry needs a terminal to prompt on. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables, pass --env-file <path>, or run `mux login --oauth` to sign in with a browser.',
          );
        }
        requireInteractiveTerminal('--interactive');

        console.log('Enter your Mux API credentials.');
        console.log(
          'Get your Token ID and Secret from https://dashboard.mux.com/settings/access-tokens\n',
        );

        tokenId = await inputPrompt({ message: 'Mux Token ID:' });
        if (!tokenId.trim()) {
          throw new Error('Token ID is required');
        }

        tokenSecret = await secretPrompt({ message: 'Mux Token Secret:' });
        if (!tokenSecret.trim()) {
          throw new Error('Token Secret is required');
        }

        baseUrl = getMuxBaseUrl(null);
        source = 'interactive';
      }

      if (!json) {
        console.log('Validating credentials...');
      }
      const validation = await validateCredentials(
        tokenId.trim(),
        tokenSecret.trim(),
        baseUrl,
      );

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid credentials');
      }

      // Saving credentials must not destroy environment-bound state (signing
      // keys, forward URL) or a separate OAuth login for the same environment.
      // When the new credentials belong to a *different* environment, that state
      // no longer applies and is dropped rather than silently carried over.
      const existing = await getEnvironment(envName);
      const sameEnvironment =
        existing?.environmentId &&
        existing.environmentId === validation.environmentId;

      // Written as one whole entry rather than removing and recreating. Removing
      // an entry reassigns `defaultEnvironment` when it happens to be the active
      // one, so re-logging into the environment you were already using would
      // silently switch you to a different account — and any entry without an
      // `environmentId`, which includes older configs, took that path.
      const preserved =
        existing && sameEnvironment
          ? {
              // Signing keys, forward URL, and the bound API host.
              ...environmentSettings(existing),
              ...(existing.environmentName && {
                environmentName: existing.environmentName,
              }),
              ...(existing.organizationId && {
                organizationId: existing.organizationId,
              }),
              ...(existing.organizationName && {
                organizationName: existing.organizationName,
              }),
              // A browser sign-in for this same environment stays usable.
              ...(existing.oauth && { oauth: existing.oauth }),
            }
          : {};

      await setEnvironment(envName, {
        ...preserved,
        environmentId: validation.environmentId,
        ...(baseUrl !== DEFAULT_BASE_URL && { baseUrl }),
        ...signingKeys,
        token: { tokenId: tokenId.trim(), tokenSecret: tokenSecret.trim() },
      });

      if (json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              environment: envName,
              environment_id: validation.environmentId,
              config_path: getConfigPath(),
              source,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log('✅ Credentials validated successfully');
      console.log(`✅ Saved as environment "${envName}"`);

      if (existingEnvs.length === 0) {
        console.log(`✅ Set as default environment`);
      }

      noticeSavedLoginIsShadowed(json);
    } catch (error) {
      await handleCommandError(error, 'login', 'login', options);
    }
  });
