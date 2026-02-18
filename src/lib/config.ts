import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getConfigPath } from './xdg.ts';

export interface Environment {
  tokenId: string;
  tokenSecret: string;
  signingKeyId?: string;
  signingPrivateKey?: string;
}

export interface Config {
  environments: Record<string, Environment>;
  defaultEnvironment?: string;
}

/**
 * Read the config file. Returns null if it doesn't exist.
 */
export async function readConfig(): Promise<Config | null> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read config: ${error}`);
  }
}

/**
 * Write the config file, creating the directory if needed
 */
export async function writeConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  try {
    // Create directory if needed - recursive: true makes this idempotent
    await mkdir(configDir, { recursive: true, mode: 0o700 });

    await writeFile(configPath, JSON.stringify(config, null, 2), {
      mode: 0o600, // Only readable/writable by owner
    });
  } catch (error) {
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
 * Get the default environment, or the only environment if there's just one
 */
export async function getDefaultEnvironment(): Promise<{
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
 * Set the default environment
 */
export async function setDefaultEnvironment(name: string): Promise<void> {
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
