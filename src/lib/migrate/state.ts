import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
  /** Source captions saved locally because they could not be passed to Mux by URL. */
  captionsPending: number;
  verification?: Verification;
  updatedAt: number;
}

export interface VerifyCheck {
  name:
    | 'asset_ready'
    | 'duration'
    | 'text_tracks'
    | 'playback'
    | 'directive_runs';
  ok: boolean;
  message?: string;
}

export interface Verification {
  verifiedAt: number;
  passed: boolean;
  checks: VerifyCheck[];
}

export type ItemPatch = Partial<
  Omit<ItemRecord, 'sourceId' | 'item' | 'updatedAt'>
>;

const ITEM_STATES: ItemState[] = [
  'discovered',
  'preparing',
  'resolved',
  'creating',
  'processing',
  'enriching',
  'ready',
  'skipped',
  'errored',
];

interface ItemRow {
  source_id: string;
  state: ItemState;
  item_json: string;
  fidelity: 'original' | 'rendition' | null;
  asset_id: string | null;
  playback_ids_json: string;
  create_started_at: number | null;
  error_json: string | null;
  attempts: number;
  recipe_hash: string | null;
  directive_runs_json: string;
  captions_pending: number;
  verification_json: string | null;
  updated_at: number;
}

const COLUMNS: Record<
  keyof ItemPatch,
  { column: string; encode: (value: never) => unknown }
> = {
  state: { column: 'state', encode: (v: ItemState) => v },
  fidelity: { column: 'fidelity', encode: (v?: string) => v ?? null },
  assetId: { column: 'asset_id', encode: (v?: string) => v ?? null },
  playbackIds: {
    column: 'playback_ids_json',
    encode: (v: unknown[]) => JSON.stringify(v),
  },
  createStartedAt: {
    column: 'create_started_at',
    encode: (v?: number) => v ?? null,
  },
  error: {
    column: 'error_json',
    encode: (v?: MigrationError) => (v ? JSON.stringify(v) : null),
  },
  attempts: { column: 'attempts', encode: (v: number) => v },
  recipeHash: { column: 'recipe_hash', encode: (v?: string) => v ?? null },
  directiveRuns: {
    column: 'directive_runs_json',
    encode: (v: DirectiveRunSummary[]) => JSON.stringify(v),
  },
  captionsPending: { column: 'captions_pending', encode: (v: number) => v },
  verification: {
    column: 'verification_json',
    encode: (v?: Verification) => (v ? JSON.stringify(v) : null),
  },
};

function toRecord(row: ItemRow): ItemRecord {
  return {
    sourceId: row.source_id,
    state: row.state,
    item: JSON.parse(row.item_json),
    fidelity: row.fidelity ?? undefined,
    assetId: row.asset_id ?? undefined,
    playbackIds: JSON.parse(row.playback_ids_json),
    createStartedAt: row.create_started_at ?? undefined,
    error: row.error_json ? JSON.parse(row.error_json) : undefined,
    attempts: row.attempts,
    recipeHash: row.recipe_hash ?? undefined,
    directiveRuns: JSON.parse(row.directive_runs_json),
    captionsPending: row.captions_pending,
    verification: row.verification_json
      ? JSON.parse(row.verification_json)
      : undefined,
    updatedAt: row.updated_at,
  };
}

/**
 * Resumable migration state, stored in SQLite via bun:sqlite. Every write is
 * committed before the method returns, so a crash never loses a transition.
 */
export class MigrationState {
  private constructor(private db: Database) {}

  static open(path: string): MigrationState {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path, { create: true, strict: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS migration (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        item_json TEXT NOT NULL,
        fidelity TEXT,
        asset_id TEXT,
        playback_ids_json TEXT NOT NULL DEFAULT '[]',
        create_started_at INTEGER,
        error_json TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        recipe_hash TEXT,
        directive_runs_json TEXT NOT NULL DEFAULT '[]',
        captions_pending INTEGER NOT NULL DEFAULT 0,
        verification_json TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS items_asset_id ON items (asset_id);
    `);
    return new MigrationState(db);
  }

  /** Returns the existing migration, or creates one for this provider. */
  initMigration(provider: ProviderId): MigrationInfo {
    const existing = this.migration();
    if (existing) return existing;
    const info: MigrationInfo = {
      id: `mig_${crypto.randomUUID().replaceAll('-', '')}`,
      provider,
      createdAt: Date.now(),
    };
    this.db
      .query(
        'INSERT INTO migration (id, provider, created_at) VALUES (?, ?, ?)',
      )
      .run(info.id, info.provider, info.createdAt);
    return info;
  }

  migration(): MigrationInfo | undefined {
    const row = this.db
      .query<{ id: string; provider: ProviderId; created_at: number }, []>(
        'SELECT id, provider, created_at FROM migration LIMIT 1',
      )
      .get();
    return row
      ? { id: row.id, provider: row.provider, createdAt: row.created_at }
      : undefined;
  }

  /** Adds new items as `discovered` (or `skipped`); existing items keep their state. */
  upsertDiscovered(items: SourceItem[]): { added: number } {
    const insert = this.db.query(
      `INSERT INTO items (source_id, state, item_json, error_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (source_id) DO UPDATE SET item_json = excluded.item_json`,
    );
    let added = 0;
    this.db.transaction(() => {
      for (const item of items) {
        const isNew = !this.get(item.sourceId);
        const skipped = !item.exportable;
        const error = skipped
          ? JSON.stringify({
              code: 'SOURCE_NOT_EXPORTABLE',
              message: item.skipReason ?? 'Not exportable',
            })
          : null;
        insert.run(
          item.sourceId,
          skipped ? 'skipped' : 'discovered',
          JSON.stringify(item),
          error,
          Date.now(),
        );
        if (isNew) added++;
      }
    })();
    return { added };
  }

  get(sourceId: string): ItemRecord | undefined {
    const row = this.db
      .query<ItemRow, [string]>('SELECT * FROM items WHERE source_id = ?')
      .get(sourceId);
    return row ? toRecord(row) : undefined;
  }

  findByAssetId(assetId: string): ItemRecord | undefined {
    const row = this.db
      .query<ItemRow, [string]>('SELECT * FROM items WHERE asset_id = ?')
      .get(assetId);
    return row ? toRecord(row) : undefined;
  }

  list(filter: { states?: ItemState[] } = {}): ItemRecord[] {
    const states = filter.states;
    const rows = states
      ? this.db
          .query<ItemRow, string[]>(
            `SELECT * FROM items WHERE state IN (${states.map(() => '?').join(', ')}) ORDER BY seq`,
          )
          .all(...states)
      : this.db.query<ItemRow, []>('SELECT * FROM items ORDER BY seq').all();
    return rows.map(toRecord);
  }

  /** Writes the patch durably before returning. */
  update(sourceId: string, patch: ItemPatch): ItemRecord {
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];
    for (const key of Object.keys(patch) as Array<keyof ItemPatch>) {
      const { column, encode } = COLUMNS[key];
      sets.push(`${column} = ?`);
      values.push(encode(patch[key] as never));
    }
    const result = this.db
      .query(`UPDATE items SET ${sets.join(', ')} WHERE source_id = ?`)
      .run(...(values as string[]), sourceId);
    if (result.changes === 0) {
      throw new Error(`Unknown migration item: ${sourceId}`);
    }
    return this.get(sourceId) as ItemRecord;
  }

  counts(): Record<ItemState, number> {
    const counts = Object.fromEntries(ITEM_STATES.map((s) => [s, 0])) as Record<
      ItemState,
      number
    >;
    const rows = this.db
      .query<{ state: ItemState; n: number }, []>(
        'SELECT state, COUNT(*) AS n FROM items GROUP BY state',
      )
      .all();
    for (const row of rows) counts[row.state] = row.n;
    return counts;
  }

  close(): void {
    this.db.close();
  }
}
