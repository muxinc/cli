import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getEventsDatabasePath } from './xdg.ts';

export interface StoredEvent {
  id: string;
  type: string;
  timestamp: string;
  environmentId: string;
  payload: Record<string, unknown>;
}

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;

  const dbPath = getEventsDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      payload     TEXT NOT NULL
    )
  `);
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp)',
  );
  db.run('CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)');

  return db;
}

export function appendEvent(event: StoredEvent): void {
  const database = getDb();
  database
    .query(
      'INSERT OR IGNORE INTO events (id, type, timestamp, environment_id, payload) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      event.id,
      event.type,
      event.timestamp,
      event.environmentId,
      JSON.stringify(event.payload),
    );
}

export function listEvents(limit = 25): StoredEvent[] {
  if (limit <= 0) return [];
  const database = getDb();
  const rows = database
    .query(
      'SELECT id, type, timestamp, environment_id, payload FROM events ORDER BY timestamp DESC LIMIT ?',
    )
    .all(limit) as Array<{
    id: string;
    type: string;
    timestamp: string;
    environment_id: string;
    payload: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    environmentId: row.environment_id,
    payload: JSON.parse(row.payload),
  }));
}

export function getEventById(id: string): StoredEvent | undefined {
  const database = getDb();
  const row = database
    .query(
      'SELECT id, type, timestamp, environment_id, payload FROM events WHERE id = ?',
    )
    .get(id) as {
    id: string;
    type: string;
    timestamp: string;
    environment_id: string;
    payload: string;
  } | null;

  if (!row) return undefined;

  return {
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    environmentId: row.environment_id,
    payload: JSON.parse(row.payload),
  };
}

export function getAllEvents(): StoredEvent[] {
  const database = getDb();
  const rows = database
    .query(
      'SELECT id, type, timestamp, environment_id, payload FROM events ORDER BY timestamp ASC',
    )
    .all() as Array<{
    id: string;
    type: string;
    timestamp: string;
    environment_id: string;
    payload: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    environmentId: row.environment_id,
    payload: JSON.parse(row.payload),
  }));
}

/**
 * Close the database connection. Primarily for testing cleanup.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
