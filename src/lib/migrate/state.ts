import type {
  DirectiveRunSummary,
  ItemState,
  MigrationError,
  ProviderId,
  SourceItem,
} from './types.ts';

export interface MigrationInfo {
  id: string;
  provider: ProviderId;
  createdAt: number;
}

export interface ItemRecord {
  sourceId: string;
  state: ItemState;
  item: SourceItem;
  fidelity?: 'original' | 'rendition';
  assetId?: string;
  playbackIds: Array<{ id: string; policy: string }>;
  /** Epoch milliseconds when the asset create request was started. */
  createStartedAt?: number;
  error?: MigrationError;
  attempts: number;
  recipeHash?: string;
  directiveRuns: DirectiveRunSummary[];
  updatedAt: number;
}

export type ItemPatch = Partial<
  Omit<ItemRecord, 'sourceId' | 'item' | 'updatedAt'>
>;

/** Resumable migration state, stored in SQLite via bun:sqlite. */
export class MigrationState {
  static open(_path: string): MigrationState {
    throw new Error('Not implemented');
  }

  /** Returns the existing migration, or creates one for this provider. */
  initMigration(_provider: ProviderId): MigrationInfo {
    throw new Error('Not implemented');
  }

  migration(): MigrationInfo | undefined {
    throw new Error('Not implemented');
  }

  /** Adds new items as `discovered` (or `skipped`); existing items keep their state. */
  upsertDiscovered(_items: SourceItem[]): { added: number } {
    throw new Error('Not implemented');
  }

  get(_sourceId: string): ItemRecord | undefined {
    throw new Error('Not implemented');
  }

  list(_filter?: { states?: ItemState[] }): ItemRecord[] {
    throw new Error('Not implemented');
  }

  /** Writes the patch durably before returning. */
  update(_sourceId: string, _patch: ItemPatch): ItemRecord {
    throw new Error('Not implemented');
  }

  counts(): Record<ItemState, number> {
    throw new Error('Not implemented');
  }

  close(): void {
    throw new Error('Not implemented');
  }
}
