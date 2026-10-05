import { resolve } from 'node:path';
import { wantsJson } from '@/lib/context.ts';
import type { MigrateContext, MigrateIO } from '@/lib/migrate/cli.ts';
import { createMuxMigrateClient } from '@/lib/migrate/client.ts';
import { MigrationFailure } from '@/lib/migrate/errors.ts';
import { ExitCode } from '@/lib/migrate/exit-codes.ts';
import { createManifestProvider } from '@/lib/migrate/providers/manifest.ts';
import { loadRecipe, type Recipe } from '@/lib/migrate/recipe.ts';
import { MigrationState } from '@/lib/migrate/state.ts';
import { createStreamEventSource } from '@/lib/migrate/stream.ts';
import type { MigrationError, SourceProvider } from '@/lib/migrate/types.ts';
import {
  createAuthenticatedMuxClient,
  getAuthContext,
  getAuthHeaders,
  refreshActiveOAuthCredentials,
} from '@/lib/mux.ts';

export const DEFAULT_STATE_PATH = '.mux-migrate/state.db';

export interface SharedOptions {
  state?: string;
  json?: boolean;
}

export interface SourceOptions extends SharedOptions {
  recipe?: string;
  manifest?: string;
}

export function createIO(options: { json?: boolean }): MigrateIO {
  return {
    json: wantsJson(options),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
}

export function openState(options: SharedOptions): MigrationState {
  return MigrationState.open(resolve(options.state ?? DEFAULT_STATE_PATH));
}

/** Prints an error in the migrate output contract and exits. */
export function exitWithError(io: MigrateIO, error: MigrationError): never {
  if (io.json) {
    io.out(JSON.stringify({ type: 'error', ...error }));
  } else {
    io.err(`Error [${error.code}]: ${error.message}`);
    if (error.hint) io.err(`Hint: ${error.hint}`);
    if (error.next_command) io.err(`Next: ${error.next_command}`);
  }
  process.exit(ExitCode.Usage);
}

function createProvider(
  providerId: string,
  options: SourceOptions,
  recipe: Recipe | undefined,
): SourceProvider<void> {
  if (providerId === 'manifest') {
    const path = options.manifest ?? recipe?.source?.manifest;
    if (!path) {
      throw new MigrationFailure({
        code: 'MANIFEST_PATH_REQUIRED',
        message:
          'The manifest provider needs the path to a .json or .csv manifest.',
        hint: 'Pass --manifest <path>, or set source.manifest in the recipe.',
      });
    }
    return createManifestProvider(resolve(path));
  }
  throw new MigrationFailure({
    code: 'PROVIDER_NOT_AVAILABLE',
    message: `The ${providerId} provider is not available in this version of the CLI.`,
    hint: 'Export the library to a manifest file and use the manifest provider.',
  });
}

/** Builds the full migration context for commands that read the source and call Mux. */
export async function createMigrateContext(
  providerArg: string | undefined,
  options: SourceOptions,
): Promise<MigrateContext> {
  const io = createIO(options);
  const recipe = await loadRecipe(options.recipe, process.cwd());
  const state = openState(options);
  const existing = state.migration();
  const providerId = providerArg ?? recipe?.provider ?? existing?.provider;
  if (!providerId) {
    throw new MigrationFailure({
      code: 'PROVIDER_REQUIRED',
      message: 'No provider was given.',
      hint: 'Pass a provider, such as `mux migrate plan manifest`, or set "provider" in mux-migrate.json.',
    });
  }
  if (existing && existing.provider !== providerId) {
    throw new MigrationFailure({
      code: 'MIGRATION_PROVIDER_MISMATCH',
      message: `The state file belongs to a ${existing.provider} migration, not ${providerId}.`,
      hint: 'Use --state to point at a different state file for a second migration.',
    });
  }

  const provider = createProvider(providerId, options, recipe);
  const mux = createMuxMigrateClient(await createAuthenticatedMuxClient());
  const { baseUrl } = await getAuthContext();
  const events = createStreamEventSource({
    url: `${baseUrl}/system/v1/webhook-events/stream`,
    getHeaders: getAuthHeaders,
    refreshCredentials: refreshActiveOAuthCredentials,
  });

  return {
    deps: {
      state,
      provider: provider as SourceProvider<unknown>,
      credentials: undefined,
      mux,
      events,
      clock: { now: () => Date.now() },
    },
    recipe,
    io,
  };
}

/** Builds a context that only reads and writes the local state file. */
export function createStateContext(
  options: SharedOptions,
): Pick<MigrateContext, 'deps' | 'io'> {
  const state = openState(options);
  return {
    io: createIO(options),
    deps: {
      state,
      clock: { now: () => Date.now() },
    } as MigrateContext['deps'],
  };
}

export async function withContext(
  io: MigrateIO,
  build: () => Promise<MigrateContext>,
): Promise<MigrateContext> {
  try {
    return await build();
  } catch (error) {
    if (error instanceof MigrationFailure) exitWithError(io, error.toJSON());
    exitWithError(io, {
      code: 'SETUP_FAILED',
      message: error instanceof Error ? error.message : String(error),
      hint: "Run 'mux login' if you are not signed in.",
    });
  }
}
