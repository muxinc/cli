import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Command } from '@cliffy/command';
import {
  getEnvironment,
  listEnvironments,
  removeEnvironment,
  setCredential,
} from '../lib/config.ts';
import { wantsJson } from '../lib/context.ts';
import { handleCommandError } from '../lib/errors.ts';
import {
  DEFAULT_BASE_URL,
  getMuxBaseUrl,
  validateCredentials,
} from '../lib/mux.ts';
import { performOAuthLogin } from '../lib/oauth-login.ts';
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
 */
async function runOAuthLogin(options: {
  name?: string;
  port?: number;
  printUrl?: boolean;
  keepCurrent?: boolean;
  json?: boolean;
}): Promise<void> {
  const json = wantsJson(options);

  // Interactive by definition: there is no browser to drive and no terminal to
  // print an authorization URL to in machine-readable mode.
  if (json) {
    throw new Error(
      "Interactive login is not available with --json or in agent mode. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET, run 'mux login --env-file <path>', or run 'mux login' in an interactive terminal.",
    );
  }
  requireInteractiveTerminal('Browser sign-in');

  const result = await performOAuthLogin(
    {
      ...(options.name && { name: options.name }),
      ...(options.port !== undefined && { port: options.port }),
      noBrowser: options.printUrl === true,
      activate: options.keepCurrent !== true,
    },
    {
      onAuthorizationUrl: (url, opened) => {
        for (const line of formatAuthorizationNotice(url, opened)) {
          console.log(line);
        }
      },
    },
  );

  const { identity } = result;
  const org = identity.organizationName ?? identity.organizationId ?? 'unknown';
  const env = identity.environmentName ?? identity.environmentId ?? 'unknown';

  console.log(`\n✅ Signed in to ${org} / ${env}`);
  if (identity.environmentId) {
    console.log(`   Environment ID: ${identity.environmentId}`);
  }
  console.log(
    `✅ ${result.replacedExisting ? 'Updated' : 'Saved as'} environment "${result.name}" in ${getConfigPath()}`,
  );
  if (result.activated) {
    console.log('✅ Set as the active environment');
  } else {
    console.log(`   Run 'mux env switch ${result.name}' to use it.`);
  }
  noticeSavedLoginIsShadowed(json);
}

// Explicitly annotated: Cliffy's builder type cannot be named across this many
// chained options without leaking an internal module path into the .d.ts.
export const loginCommand = new Command()
  .description(
    'Sign in to Mux. Opens your browser to select an organization and environment; use --interactive, --env-file, or --from-env for a Mux API access token instead.',
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
            'No credentials provided. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables, or pass --env-file <path>. Interactive login is not available with --json or in agent mode.',
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

      if (existing && !sameEnvironment) {
        // Entry is being repointed at another environment: clear it first so no
        // stale signing keys, forward URL, or OAuth login survive.
        await removeEnvironment(envName);
      }

      await setCredential(
        envName,
        'token',
        { tokenId: tokenId.trim(), tokenSecret: tokenSecret.trim() },
        {
          environmentId: validation.environmentId,
          ...(baseUrl !== DEFAULT_BASE_URL && { baseUrl }),
          ...signingKeys,
        },
      );

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
      console.log(
        `✅ Credentials saved to ${getConfigPath()} for environment: ${envName}`,
      );

      if (existingEnvs.length === 0) {
        console.log(`✅ Set as default environment`);
      }

      noticeSavedLoginIsShadowed(json);
    } catch (error) {
      await handleCommandError(error, 'login', 'login', options);
    }
  });
