/**
 * Which authentication method `mux login` should use.
 *
 * The rule is that the CLI never guesses when the shell already carries
 * credentials. Environment variables always win at runtime, so silently saving
 * them on `mux login` produced a config entry that had no effect while those
 * variables stayed set — the caller has to say what they actually meant.
 */

export type LoginMode = 'oauth' | 'interactive' | 'env-file' | 'from-env';

export interface LoginModeOptions {
  oauth?: boolean;
  interactive?: boolean;
  fromEnv?: boolean;
  envFile?: string;
  [key: string]: unknown;
}

export const ENV_VARS_DETECTED_MESSAGE = [
  'MUX_TOKEN_ID and MUX_TOKEN_SECRET detected. No `mux login` is necessary.',
  "You can run commands directly without calling 'login'.",
  '',
  'If you also want a persistent login saved to the config,',
  'then specify how to authenticate:',
  '  Use `mux login --from-env` to save the shell env var credentials',
  '  Use `mux login --env-file <path>` to use credentials from a specific env file',
  '  Use `mux login --interactive` to manually enter credentials',
  '  Use `mux login --oauth` to sign in with a browser',
].join('\n');

const NO_ENV_VARS_MESSAGE = [
  '--from-env was passed, but MUX_TOKEN_ID and MUX_TOKEN_SECRET are not set in this shell.',
  'Set both variables, or choose another method:',
  '  `mux login --env-file <path>` to read credentials from a file',
  '  `mux login --interactive` to enter them manually',
  '  `mux login --oauth` to sign in with a browser',
].join('\n');

/** The flag that selects each mode, for error messages. */
const MODE_FLAGS: Record<LoginMode, string> = {
  oauth: '--oauth',
  interactive: '--interactive',
  'env-file': '--env-file',
  'from-env': '--from-env',
};

/**
 * Resolve the login mode, or throw a message explaining what to pass instead.
 *
 * `env` is injectable so this stays a pure function.
 */
export function resolveLoginMode(
  options: LoginModeOptions,
  env: Record<string, string | undefined> = process.env,
): LoginMode {
  const selected: LoginMode[] = [];
  if (options.oauth) selected.push('oauth');
  if (options.interactive) selected.push('interactive');
  if (options.envFile) selected.push('env-file');
  if (options.fromEnv) selected.push('from-env');

  if (selected.length > 1) {
    const flags = selected.map((mode) => MODE_FLAGS[mode]).join(', ');
    throw new Error(
      `Pass only one of --env-file, --from-env, --oauth, or --interactive (got ${flags}).`,
    );
  }

  const hasEnvCredentials = Boolean(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET);

  if (selected.length === 1) {
    const mode = selected[0];
    if (mode === 'from-env' && !hasEnvCredentials) {
      throw new Error(NO_ENV_VARS_MESSAGE);
    }
    return mode;
  }

  // No explicit mode. Shell credentials make the intent ambiguous — saving them
  // is a different outcome from starting a browser login — so ask rather than
  // pick. Without them, the browser flow is the default.
  if (hasEnvCredentials) {
    throw new Error(ENV_VARS_DETECTED_MESSAGE);
  }

  return 'oauth';
}
