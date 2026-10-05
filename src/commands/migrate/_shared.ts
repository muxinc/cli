import { dirname, resolve } from 'node:path';
import { wantsJson } from '@/lib/context.ts';
import {
  createBucketCaptionHost,
  createLocalCaptionStore,
  hostBucketConfig,
} from '@/lib/migrate/captions.ts';
import type { MigrateContext, MigrateIO } from '@/lib/migrate/cli.ts';
import { createMuxMigrateClient } from '@/lib/migrate/client.ts';
import { MigrationFailure } from '@/lib/migrate/errors.ts';
import { ExitCode } from '@/lib/migrate/exit-codes.ts';
import {
  createProvider,
  credentialOverrides,
  providerCredentials,
} from '@/lib/migrate/providers/index.ts';
import { loadRecipe } from '@/lib/migrate/recipe.ts';
import { MigrationState } from '@/lib/migrate/state.ts';
import { createStreamEventSource } from '@/lib/migrate/stream.ts';
import type { MigrationError } from '@/lib/migrate/types.ts';
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
  /** `--credential NAME=value`, overriding the environment variable of that name. */
  credential?: string[];
}

export function createIO(options: { json?: boolean }): MigrateIO {
  return {
    json: wantsJson(options),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
}

function statePath(options: SharedOptions): string {
  return resolve(options.state ?? DEFAULT_STATE_PATH);
}

export function openState(options: SharedOptions): MigrationState {
  return MigrationState.open(statePath(options));
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

async function muxDeps() {
  const mux = createMuxMigrateClient(await createAuthenticatedMuxClient());
  const { baseUrl } = await getAuthContext();
  const events = createStreamEventSource({
    url: `${baseUrl}/system/v1/webhook-events/stream`,
    getHeaders: getAuthHeaders,
    refreshCredentials: refreshActiveOAuthCredentials,
  });
  return { mux, events, clock: { now: () => Date.now() } };
}

/** Builds the full migration context for commands that read the source and call Mux. */
export async function createMigrateContext(
  providerArg: string | undefined,
  options: SourceOptions,
): Promise<MigrateContext> {
  const io = createIO(options);
  const cwd = process.cwd();
  const recipe = (await loadRecipe(options.recipe, cwd)) ?? {};
  const state = openState(options);
  const existing = state.migration();
  const providerId = providerArg ?? recipe.provider ?? existing?.provider;
  if (!providerId) {
    throw new MigrationFailure({
      code: 'PROVIDER_REQUIRED',
      message: 'No provider was given.',
      hint: 'Pass a provider, such as `mux migrate plan vimeo`, or run `mux migrate init <provider>` to write a recipe.',
    });
  }
  if (existing && existing.provider !== providerId) {
    throw new MigrationFailure({
      code: 'MIGRATION_PROVIDER_MISMATCH',
      message: `The state file belongs to a ${existing.provider} migration, not ${providerId}.`,
      hint: 'Use --state to point at a different state file for a second migration.',
    });
  }

  const provider = createProvider(providerId, {
    recipe,
    cwd,
    manifestPath: options.manifest,
  });
  const credentials = providerCredentials(
    provider,
    process.env,
    options.credential,
  );
  const captions = createLocalCaptionStore(dirname(statePath(options)));
  const hostBucket = recipe.captions?.host_bucket;
  if (hostBucket) {
    const env = { ...process.env, ...credentialOverrides(options.credential) };
    captions.host = createBucketCaptionHost(hostBucketConfig(hostBucket, env));
  }

  return {
    deps: {
      state,
      provider,
      credentials,
      captions,
      ...(await muxDeps()),
    },
    recipe,
    io,
  };
}

/** Builds a context for commands that use the state file and Mux, but not the source. */
export async function createMuxContext(
  options: SharedOptions,
): Promise<Pick<MigrateContext, 'deps' | 'io'>> {
  return {
    io: createIO(options),
    deps: {
      state: openState(options),
      ...(await muxDeps()),
    } as MigrateContext['deps'],
  };
}

/** Builds a context that only reads and writes the local state file. */
export function createStateContext(
  options: SharedOptions,
): Pick<MigrateContext, 'deps' | 'io'> {
  return {
    io: createIO(options),
    deps: {
      state: openState(options),
      clock: { now: () => Date.now() },
    } as MigrateContext['deps'],
  };
}

export async function withContext<T>(
  io: MigrateIO,
  build: () => Promise<T>,
): Promise<T> {
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
