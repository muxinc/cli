import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getConfigPath } from './xdg.ts';

export type {
  CredentialError,
  CredentialKind,
  Environment,
  OAuthCredentials,
  TokenCredentials,
} from './credentials.ts';

import {
  type CredentialError,
  type CredentialKind,
  type Environment,
  getPreferredCredential,
  normalizeEnvironment,
  flagCredential as withFlag,
} from './credentials.ts';

/**
 * Partial update to an environment. Credential blocks are replaced wholesale by
 * `setCredential`; this covers the environment-level fields.
 */
export type EnvironmentUpdate = Partial<Omit<Environment, 'oauth' | 'token'>> &
  Partial<Pick<Environment, 'oauth' | 'token'>>;

export interface Config {
  environments: Record<string, Environment>;
  defaultEnvironment?: string;
}

/** Whether an environment's preferred credential is an OAuth login. */
export function isOAuthEnvironment(environment: Environment): boolean {
  return getPreferredCredential(environment)?.kind === 'oauth';
}

/** The credential kind a request would use for this environment. */
export function getEnvironmentAuthType(
  environment: Environment,
): CredentialKind {
  // An entry with no credentials at all still has to render as something;
  // 'token' matches how an entry with no explicit kind has always been read.
  return getPreferredCredential(environment)?.kind ?? 'token';
}

/**
 * Read the config file. Returns null if it doesn't exist.
 */
export async function readConfig(): Promise<Config | null> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  let parsed: Config;
  try {
    const content = await readFile(configPath, 'utf-8');
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read config: ${error}`);
  }

  // Normalize on read so the rest of the CLI only ever sees the nested
  // credential layout. Files written by earlier versions stay as they are on
  // disk until something writes them back — and note that any write persists
  // every entry in the current layout, including ones the command never
  // touched, so an older CLI will read them as having no credentials. The
  // credentials themselves are untouched, just relocated within the file.
  const environments: Record<string, Environment> = {};
  for (const [name, environment] of Object.entries(parsed.environments ?? {})) {
    environments[name] = normalizeEnvironment(environment);
  }

  return { ...parsed, environments };
}

/**
 * Write the config file, creating the directory if needed.
 *
 * The write is atomic: content goes to a temporary file in the same directory
 * and is then renamed over the target. Token refresh can run concurrently with
 * other invocations, and a reader must never observe a half-written config.
 */
export async function writeConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  // Same directory, so the rename stays within one filesystem; pid keeps
  // concurrent writers from clobbering each other's temporary file.
  const tempPath = `${configPath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;

  try {
    // Create directory if needed - recursive: true makes this idempotent
    await mkdir(configDir, { recursive: true, mode: 0o700 });

    await writeFile(tempPath, JSON.stringify(config, null, 2), {
      mode: 0o600, // Only readable/writable by owner
    });
    await rename(tempPath, configPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw new Error(`Failed to write config: ${error}`);
  }
}

/**
 * Get a specific environment by name
 */
export async function getEnvironment(
  name: string,
): Promise<Environment | null> {
  const config = await readConfig();
  if (!config) return null;

  return config.environments[name] || null;
}

/**
 * Set or update an environment
 */
export async function setEnvironment(
  name: string,
  environment: Environment,
): Promise<void> {
  const config = (await readConfig()) || {
    environments: {},
  };

  config.environments[name] = environment;

  // If this is the first environment, set it as default
  if (Object.keys(config.environments).length === 1) {
    config.defaultEnvironment = name;
  }

  await writeConfig(config);
}

/**
 * Update specific fields on an existing environment
 */
export async function updateEnvironment(
  name: string,
  updates: EnvironmentUpdate,
): Promise<void> {
  const config = await readConfig();
  if (!config || !config.environments[name]) {
    throw new Error(`Environment "${name}" does not exist`);
  }
  config.environments[name] = {
    ...config.environments[name],
    ...updates,
  };
  await writeConfig(config);
}

/**
 * Save one credential block, leaving the other and every environment-level
 * field untouched. This is what lets a single environment hold both an OAuth
 * login and an access token pair.
 */
export async function setCredential(
  name: string,
  kind: CredentialKind,
  credential: NonNullable<Environment['oauth' | 'token']>,
  environmentFields: Partial<Omit<Environment, 'oauth' | 'token'>> = {},
): Promise<void> {
  const config = (await readConfig()) || { environments: {} };
  const existing = config.environments[name] ?? {};

  config.environments[name] = {
    ...existing,
    ...environmentFields,
    [kind]: credential,
  } as Environment;

  if (Object.keys(config.environments).length === 1) {
    config.defaultEnvironment = name;
  }

  await writeConfig(config);
}

/**
 * Record or clear a credential failure. Never deletes the credential: removing
 * it is the user's call, and a flagged block still lets `mux auth status`
 * explain what happened.
 */
export async function flagCredential(
  name: string,
  kind: CredentialKind,
  error: CredentialError | null,
): Promise<void> {
  const config = await readConfig();
  if (!config?.environments[name]) return;

  config.environments[name] = withFlag(config.environments[name], kind, error);
  await writeConfig(config);
}

/**
 * Remove a single credential block, keeping the environment (and its other
 * credential) when one remains. Returns false when the entry or block is absent.
 */
export async function removeCredential(
  name: string,
  kind: CredentialKind,
): Promise<boolean> {
  const config = await readConfig();
  const existing = config?.environments[name];
  if (!config || !existing?.[kind]) return false;

  const { [kind]: _removed, ...rest } = existing;
  config.environments[name] = rest;
  await writeConfig(config);
  return true;
}

/**
 * Find the environment holding a given Mux environment id, whatever its local
 * name. Re-login resolves an existing entry this way rather than by name, so
 * logging in to a second environment adds an entry instead of overwriting one.
 */
export async function findEnvironmentByEnvironmentId(
  environmentId: string,
): Promise<{ name: string; environment: Environment } | null> {
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
 * Get the current (selected) environment, or the only environment if there's just one
 */
export async function getCurrentEnvironment(): Promise<{
  name: string;
  environment: Environment;
} | null> {
  const config = await readConfig();
  if (!config || Object.keys(config.environments).length === 0) {
    return null;
  }

  const envNames = Object.keys(config.environments);

  // If only one environment, use it
  if (envNames.length === 1) {
    const name = envNames[0];
    return {
      name,
      environment: config.environments[name],
    };
  }

  // Otherwise use the default
  if (
    config.defaultEnvironment &&
    config.environments[config.defaultEnvironment]
  ) {
    return {
      name: config.defaultEnvironment,
      environment: config.environments[config.defaultEnvironment],
    };
  }

  return null;
}

/**
 * Set the current (selected) environment
 */
export async function setCurrentEnvironment(name: string): Promise<void> {
  const config = await readConfig();
  if (!config) {
    throw new Error('No config file exists');
  }

  if (!config.environments[name]) {
    throw new Error(`Environment "${name}" does not exist`);
  }

  config.defaultEnvironment = name;
  await writeConfig(config);
}

/**
 * List all configured environments
 */
export async function listEnvironments(): Promise<string[]> {
  const config = await readConfig();
  if (!config) return [];

  return Object.keys(config.environments);
}

/**
 * Remove an environment from the config
 */
export async function removeEnvironment(name: string): Promise<void> {
  const config = await readConfig();
  if (!config) {
    throw new Error('No config file exists');
  }

  if (!config.environments[name]) {
    throw new Error(`Environment "${name}" does not exist`);
  }

  // Remove the environment
  delete config.environments[name];

  // If this was the default environment, pick a new default
  if (config.defaultEnvironment === name) {
    const remainingEnvs = Object.keys(config.environments);
    config.defaultEnvironment =
      remainingEnvs.length > 0 ? remainingEnvs[0] : undefined;
  }

  await writeConfig(config);
}
