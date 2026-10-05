import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
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
  /** Source captions saved locally because they could not be passed to Mux by URL. */
  pendingCaptions: PendingCaption[];
  /** Caption objects uploaded to the customer's bucket, deleted once Mux has the track. */
  hostedCaptions: string[];
  verification?: Verification;
  updatedAt: number;
}

/** A second asset found for one source item. The migration keeps the first. */
export interface DuplicateRecord {
  sourceId: string;
  keptAssetId: string;
  duplicateAssetId: string;
}

export interface RunLock {
  release(): void;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface PendingCaption {
  language: string;
  path: string;
  label?: string;
  closedCaptions: boolean;
}

export interface VerifyCheck {
  name: 'asset_ready' | 'duration' | 'text_tracks' | 'playback';
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
  pending_captions_json: string;
  hosted_captions_json: string;
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
  pendingCaptions: {
    column: 'pending_captions_json',
    encode: (v: PendingCaption[]) => JSON.stringify(v),
  },
  hostedCaptions: {
    column: 'hosted_captions_json',
    encode: (v: string[]) => JSON.stringify(v),
  },
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
    pendingCaptions: JSON.parse(row.pending_captions_json),
    hostedCaptions: JSON.parse(row.hosted_captions_json),
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
      CREATE TABLE IF NOT EXISTS duplicates (
        duplicate_asset_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        kept_asset_id TEXT NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pid INTEGER NOT NULL,
        token TEXT NOT NULL,
        acquired_at INTEGER NOT NULL
      );
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
        pending_captions_json TEXT NOT NULL DEFAULT '[]',
        hosted_captions_json TEXT NOT NULL DEFAULT '[]',
        verification_json TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS items_asset_id ON items (asset_id);
      CREATE INDEX IF NOT EXISTS items_state ON items (state);
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

  /**
   * Item counts by state, computed in SQL. With `ids`, only those items are
   * counted.
   */
  counts(ids?: string[]): Record<ItemState, number> {
    const counts = Object.fromEntries(ITEM_STATES.map((s) => [s, 0])) as Record<
      ItemState,
      number
    >;
    const rows = ids
      ? this.db
          .query<{ state: ItemState; n: number }, [string]>(
            'SELECT state, COUNT(*) AS n FROM items WHERE source_id IN (SELECT value FROM json_each(?)) GROUP BY state',
          )
          .all(JSON.stringify(ids))
      : this.db
          .query<{ state: ItemState; n: number }, []>(
            'SELECT state, COUNT(*) AS n FROM items GROUP BY state',
          )
          .all();
    for (const row of rows) counts[row.state] = row.n;
    return counts;
  }

  /** The number of items in any of `states`, optionally limited to `ids`. */
  count(states: ItemState[], ids?: string[]): number {
    const statesJson = JSON.stringify(states);
    const row = ids
      ? this.db
          .query<{ n: number }, [string, string]>(
            'SELECT COUNT(*) AS n FROM items WHERE state IN (SELECT value FROM json_each(?)) AND source_id IN (SELECT value FROM json_each(?))',
          )
          .get(statesJson, JSON.stringify(ids))
      : this.db
          .query<{ n: number }, [string]>(
            'SELECT COUNT(*) AS n FROM items WHERE state IN (SELECT value FROM json_each(?))',
          )
          .get(statesJson);
    return row?.n ?? 0;
  }

  sourceIds(): string[] {
    return this.db
      .query<{ source_id: string }, []>(
        'SELECT source_id FROM items ORDER BY seq',
      )
      .all()
      .map((row) => row.source_id);
  }

  /** The least recently updated items in `states`. */
  oldest(states: ItemState[], limit: number): ItemRecord[] {
    return this.db
      .query<ItemRow, [string, number]>(
        'SELECT * FROM items WHERE state IN (SELECT value FROM json_each(?)) ORDER BY updated_at, seq LIMIT ?',
      )
      .all(JSON.stringify(states), limit)
      .map(toRecord);
  }

  withPendingCaptions(): ItemRecord[] {
    return this.db
      .query<ItemRow, []>(
        "SELECT * FROM items WHERE pending_captions_json != '[]' ORDER BY seq",
      )
      .all()
      .map(toRecord);
  }

  recordDuplicate(duplicate: DuplicateRecord): void {
    this.db
      .query(
        `INSERT INTO duplicates (duplicate_asset_id, source_id, kept_asset_id, seq)
         VALUES (?, ?, ?, (SELECT COUNT(*) FROM duplicates))
         ON CONFLICT (duplicate_asset_id) DO NOTHING`,
      )
      .run(
        duplicate.duplicateAssetId,
        duplicate.sourceId,
        duplicate.keptAssetId,
      );
  }

  duplicates(): DuplicateRecord[] {
    return this.db
      .query<
        {
          source_id: string;
          kept_asset_id: string;
          duplicate_asset_id: string;
        },
        []
      >(
        'SELECT source_id, kept_asset_id, duplicate_asset_id FROM duplicates ORDER BY seq',
      )
      .all()
      .map((row) => ({
        sourceId: row.source_id,
        keptAssetId: row.kept_asset_id,
        duplicateAssetId: row.duplicate_asset_id,
      }));
  }

  /**
   * Claims the state file for one run. Returns undefined while another live
   * process holds it; a lock left by a process that has exited is taken over.
   */
  acquireRunLock(options: { pid?: number } = {}): RunLock | undefined {
    const pid = options.pid ?? process.pid;
    const token = crypto.randomUUID();
    const acquired = this.db.transaction(() => {
      const held = this.db
        .query<{ pid: number }, []>('SELECT pid FROM run_lock WHERE id = 1')
        .get();
      if (held && processExists(held.pid)) return false;
      this.db
        .query(
          'INSERT OR REPLACE INTO run_lock (id, pid, token, acquired_at) VALUES (1, ?, ?, ?)',
        )
        .run(pid, token, Date.now());
      return true;
    })();
    if (!acquired) return undefined;
    return {
      release: () => {
        this.db.query('DELETE FROM run_lock WHERE token = ?').run(token);
      },
    };
  }

  close(): void {
    this.db.close();
  }
}
