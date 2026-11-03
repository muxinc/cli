import { MigrationFailure } from '../errors.ts';
import type { CredentialSpec } from '../types.ts';

/**
 * Builds a credential spec from environment variable names. Missing required
 * variables are reported together, with what each one is for.
 */
export function envCredentials<Keys extends string>(
  providerName: string,
  errorPrefix: string,
  variables: Array<{
    key: Keys;
    name: string;
    required: boolean;
    description: string;
  }>,
): CredentialSpec<Record<Keys, string | undefined>> {
  return {
    variables: variables.map(({ name, required, description }) => ({
      name,
      required,
      description,
    })),
    read(env) {
      const missing = variables.filter((v) => v.required && !env[v.name]);
      if (missing.length > 0) {
        throw new MigrationFailure({
          code: `${errorPrefix}_CREDENTIALS_MISSING`,
          message: `${providerName} credentials are missing: ${missing.map((v) => v.name).join(', ')}.`,
          hint: missing.map((v) => `${v.name}: ${v.description}`).join(' '),
        });
      }
      return Object.fromEntries(
        variables.map((v) => [v.key, env[v.name] || undefined]),
      ) as Record<Keys, string | undefined>;
    },
  };
}
