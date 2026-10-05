import type { SourceProvider } from '../types.ts';

/** Reads a CSV or JSON manifest of source URLs. See MIGRATE_SPEC.md "Manifest". */
export function createManifestProvider(_path: string): SourceProvider<void> {
  throw new Error('Not implemented');
}
