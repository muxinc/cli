import type { MigrationState } from './state.ts';
import type { DirectiveRunSummary, ItemState } from './types.ts';

export interface MappingItem {
  source_id: string;
  source_url: string | null;
  source_embed_patterns: string[];
  title: string | null;
  description: string | null;
  tags: string[];
  folder: string | null;
  duration_seconds: number | null;
  source_poster_url: string | null;
  source_chapters: Array<{ title: string; start_seconds: number }>;
  fidelity: 'original' | 'rendition' | null;
  asset_id: string | null;
  playback_ids: Array<{ id: string; policy: string }>;
  directive_runs: Array<{
    directive_id: string;
    run_id: string;
    status: DirectiveRunSummary['status'];
  }>;
  status: ItemState;
}

export interface MappingFile {
  version: 1;
  migration_id: string;
  provider: string;
  exported_at: string;
  items: MappingItem[];
}

export function buildMapping(
  _state: MigrationState,
  _options: { include: ItemState[]; now: Date },
): MappingFile {
  throw new Error('Not implemented');
}

/** The scalar columns only, as documented in MIGRATE_SPEC.md "Mapping file". */
export function mappingToCsv(_mapping: MappingFile): string {
  throw new Error('Not implemented');
}
