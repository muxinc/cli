import { MigrationFailure } from './errors.ts';
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
  state: MigrationState,
  options: { include: ItemState[]; now: Date },
): MappingFile {
  const migration = state.migration();
  if (!migration) {
    throw new MigrationFailure({
      code: 'MIGRATION_NOT_FOUND',
      message: 'No migration was found in this state file.',
      next_command: 'mux migrate plan',
    });
  }
  return {
    version: 1,
    migration_id: migration.id,
    provider: migration.provider,
    exported_at: options.now.toISOString(),
    items: state
      .list({ states: options.include })
      .map(({ item, ...record }) => ({
        source_id: record.sourceId,
        source_url: item.sourceUrl ?? null,
        source_embed_patterns: item.embedPatterns,
        title: item.title ?? null,
        description: item.description ?? null,
        tags: item.tags ?? [],
        folder: item.folder ?? null,
        duration_seconds: item.durationSeconds ?? null,
        source_poster_url: item.posterUrl ?? null,
        source_chapters: (item.chapters ?? []).map((chapter) => ({
          title: chapter.title,
          start_seconds: chapter.startSeconds,
        })),
        fidelity: record.fidelity ?? null,
        asset_id: record.assetId ?? null,
        playback_ids: record.playbackIds,
        directive_runs: record.directiveRuns.map((run) => ({
          directive_id: run.directiveId,
          run_id: run.runId,
          status: run.status,
        })),
        status: record.state,
      })),
  };
}

const CSV_COLUMNS = [
  'source_id',
  'source_url',
  'title',
  'fidelity',
  'asset_id',
  'playback_id',
  'status',
  'verified',
] as const;

function csvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The scalar columns only, as documented in MIGRATE_SPEC.md "Mapping file". */
export function mappingToCsv(mapping: MappingFile): string {
  const rows = mapping.items.map((item) =>
    [
      item.source_id,
      item.source_url,
      item.title,
      item.fidelity,
      item.asset_id,
      item.playback_ids[0]?.id,
      item.status,
      // Filled in once `verify` records results.
      undefined,
    ]
      .map(csvField)
      .join(','),
  );
  return `${[CSV_COLUMNS.join(','), ...rows].join('\n')}\n`;
}
