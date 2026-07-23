import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Command } from '@cliffy/command';
import { listEnvironments, setEnvironment } from '../lib/config.ts';
import { wantsJson } from '../lib/context.ts';
import { handleCommandError } from '../lib/errors.ts';
import {
  DEFAULT_BASE_URL,
  getMuxBaseUrl,
  validateCredentials,
} from '../lib/mux.ts';
import { inputPrompt, secretPrompt } from '../lib/prompt.ts';
import { getConfigPath } from '../lib/xdg.ts';

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

export const loginCommand = new Command()
  .description(
    'Authenticate with Mux API credentials (Token ID and Secret from dashboard.mux.com)',
  )
  .option(
    '-f, --env-file <path:string>',
    'Path to .env file containing MUX_TOKEN_ID, MUX_TOKEN_SECRET, and optionally MUX_SIGNING_KEY and MUX_PRIVATE_KEY for signed URLs',
  )
  .option(
    '-n, --name <name:string>',
    "Name for this environment (default: 'default')",
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options) => {
    const json = wantsJson(options);
    try {
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
      const envCredentials = credentialsFromEnv();

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
        baseUrl = getMuxBaseUrl({
          environment: { baseUrl: envVars.MUX_BASE_URL },
        });
        if (envVars.MUX_SIGNING_KEY && envVars.MUX_PRIVATE_KEY) {
          signingKeys = {
            signingKeyId: envVars.MUX_SIGNING_KEY,
            signingPrivateKey: envVars.MUX_PRIVATE_KEY,
          };
        }
        source = 'env-file';
      } else if (
        envCredentials?.MUX_TOKEN_ID &&
        envCredentials.MUX_TOKEN_SECRET
      ) {
        // Read from environment variables
        if (!json) {
          console.log(
            'Using MUX_TOKEN_ID and MUX_TOKEN_SECRET from environment variables...',
          );
        }

        tokenId = envCredentials.MUX_TOKEN_ID;
        tokenSecret = envCredentials.MUX_TOKEN_SECRET;
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
        // Interactive prompts are not possible in machine-readable mode;
        // fail fast with recovery guidance instead of blocking on stdin.
        if (json) {
          throw new Error(
            'No credentials provided. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables, or pass --env-file <path>. Interactive login is not available with --json or in agent mode.',
          );
        }

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

      // Save to config
      await setEnvironment(envName, {
        tokenId: tokenId.trim(),
        tokenSecret: tokenSecret.trim(),
        environmentId: validation.environmentId,
        ...(baseUrl !== DEFAULT_BASE_URL && { baseUrl }),
        ...signingKeys,
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
      console.log(
        `✅ Credentials saved to ${getConfigPath()} for environment: ${envName}`,
      );

      if (existingEnvs.length === 0) {
        console.log(`✅ Set as default environment`);
      }
    } catch (error) {
      await handleCommandError(error, 'login', 'login', options);
    }
  });
