import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getEventsPath } from './xdg.ts';

const MAX_EVENTS = 100;

export interface StoredEvent {
  id: string;
  type: string;
  timestamp: string;
  environmentName: string;
  payload: Record<string, unknown>;
}

async function readEvents(path: string): Promise<StoredEvent[]> {
  if (!existsSync(path)) return [];
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeEvents(path: string, events: StoredEvent[]): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(events, null, 2));
}

export async function appendEvent(event: StoredEvent): Promise<void> {
  const path = getEventsPath();
  const events = await readEvents(path);
  // Deduplicate by event ID
  if (events.some((e) => e.id === event.id)) return;
  events.push(event);
  // FIFO: keep only the most recent MAX_EVENTS
  const trimmed = events.slice(-MAX_EVENTS);
  await writeEvents(path, trimmed);
}

export async function listEvents(limit = 25): Promise<StoredEvent[]> {
  const path = getEventsPath();
  const events = await readEvents(path);
  // Return most recent events first
  return events.slice(-limit).reverse();
}

export async function getEventById(
  id: string,
): Promise<StoredEvent | undefined> {
  const path = getEventsPath();
  const events = await readEvents(path);
  return events.find((e) => e.id === id);
}

export async function getAllEvents(): Promise<StoredEvent[]> {
  const path = getEventsPath();
  return readEvents(path);
}
