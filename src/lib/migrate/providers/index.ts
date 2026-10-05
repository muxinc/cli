import { resolve } from 'node:path';
import { MigrationFailure } from '../errors.ts';
import type { Recipe } from '../recipe.ts';
import type { ProviderId, SourceProvider } from '../types.ts';
import { type BunnySourceOptions, createBunnyProvider } from './bunny.ts';
import {
  type CloudflareStreamSourceOptions,
  createCloudflareStreamProvider,
} from './cloudflare-stream.ts';
import { createManifestProvider } from './manifest.ts';
import { createVimeoProvider, type VimeoSourceOptions } from './vimeo.ts';
import { createWistiaProvider, type WistiaSourceOptions } from './wistia.ts';

interface ProviderContext {
  recipe: Recipe;
  cwd: string;
  /** `--manifest`, which takes precedence over the recipe. */
  manifestPath?: string;
}

interface ProviderEntry {
  name: string;
  /** The recipe `source` block written by `mux migrate init`. */
  starterSource: Record<string, unknown>;
  create(context: ProviderContext): SourceProvider<unknown>;
}

const PROVIDERS: Record<ProviderId, ProviderEntry | undefined> = {
  vimeo: {
    name: 'Vimeo',
    starterSource: {
      folders: [],
      include_live_archives: false,
      include_private: true,
    },
    create: ({ recipe }) =>
      createVimeoProvider({
        source: recipe.source as VimeoSourceOptions,
      }) as SourceProvider<unknown>,
  },
  'cloudflare-stream': {
    name: 'Cloudflare Stream',
    starterSource: { include_live_archives: false },
    create: ({ recipe }) =>
      createCloudflareStreamProvider({
        source: recipe.source as CloudflareStreamSourceOptions,
      }) as SourceProvider<unknown>,
  },
  bunny: {
    name: 'Bunny Stream',
    starterSource: {},
    create: ({ recipe }) =>
      createBunnyProvider({
        source: recipe.source as BunnySourceOptions,
      }) as SourceProvider<unknown>,
  },
  wistia: {
    name: 'Wistia',
    starterSource: { folders: [] },
    create: ({ recipe }) =>
      createWistiaProvider({
        source: recipe.source as WistiaSourceOptions,
      }) as SourceProvider<unknown>,
  },
  bucket: undefined,
  manifest: {
    name: 'Manifest file',
    starterSource: { manifest: './videos.json' },
    create: ({ recipe, cwd, manifestPath }) => {
      const path = manifestPath ?? recipe.source?.manifest;
      if (!path) {
        throw new MigrationFailure({
          code: 'MANIFEST_PATH_REQUIRED',
          message:
            'The manifest provider needs the path to a .json or .csv manifest.',
          hint: 'Pass --manifest <path>, or set source.manifest in the recipe.',
        });
      }
      return createManifestProvider(
        resolve(cwd, path),
      ) as SourceProvider<unknown>;
    },
  },
};

export function providerIds(): ProviderId[] {
  return Object.keys(PROVIDERS) as ProviderId[];
}

export function availableProviderIds(): ProviderId[] {
  return providerIds().filter((id) => PROVIDERS[id]);
}

function entry(id: string): ProviderEntry {
  if (!(id in PROVIDERS)) {
    throw new MigrationFailure({
      code: 'PROVIDER_UNKNOWN',
      message: `Unknown provider "${id}".`,
      hint: `Supported providers: ${providerIds().join(', ')}.`,
    });
  }
  const found = PROVIDERS[id as ProviderId];
  if (!found) {
    throw new MigrationFailure({
      code: 'PROVIDER_NOT_AVAILABLE',
      message: `The ${id} provider is not available in this version of the CLI.`,
      hint: 'Export the library to a manifest file and use the manifest provider.',
    });
  }
  return found;
}

export function createProvider(
  id: string,
  context: ProviderContext,
): SourceProvider<unknown> {
  return entry(id).create(context);
}

export function starterSource(id: string): Record<string, unknown> {
  return entry(id).starterSource;
}

/**
 * Reads a provider's credentials from the environment. Each `--credential
 * NAME=value` flag overrides the environment variable of the same name.
 */
export function providerCredentials(
  provider: SourceProvider<unknown>,
  env: Record<string, string | undefined>,
  flags: string[] = [],
): unknown {
  const overrides: Record<string, string> = {};
  for (const flag of flags) {
    const separator = flag.indexOf('=');
    if (separator <= 0) {
      throw new MigrationFailure({
        code: 'CREDENTIAL_FLAG_INVALID',
        message: `--credential expects NAME=value, but got "${flag}".`,
      });
    }
    overrides[flag.slice(0, separator)] = flag.slice(separator + 1);
  }
  return provider.credentials.read({ ...env, ...overrides });
}
