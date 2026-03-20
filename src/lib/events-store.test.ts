import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir: string;
let testDbPath: string;

const actualXdg = await import('./xdg.ts');
mock.module('./xdg.ts', () => ({
  ...actualXdg,
  getEventsDatabasePath: () => testDbPath,
}));

const { appendEvent, listEvents, getEventById, getAllEvents, closeDb } =
  await import('./events-store.ts');

const ENV_ID = 'env-123';

function makeEvent(
  id: string,
  type = 'video.asset.ready',
  envId = ENV_ID,
): {
  id: string;
  type: string;
  timestamp: string;
  environmentId: string;
  payload: Record<string, unknown>;
} {
  return {
    id,
    type,
    timestamp: new Date().toISOString(),
    environmentId: envId,
    payload: { id, type },
  };
}

describe('events-store (sqlite)', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mux-events-test-'));
    testDbPath = join(testDir, 'events.db');
    closeDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test('appendEvent creates database if it does not exist', () => {
    appendEvent(makeEvent('evt_1'));
    expect(existsSync(testDbPath)).toBe(true);
    const events = getAllEvents(ENV_ID);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt_1');
  });

  test('appendEvent appends to existing events', () => {
    appendEvent(makeEvent('evt_1'));
    appendEvent(makeEvent('evt_2'));
    const events = getAllEvents(ENV_ID);
    expect(events).toHaveLength(2);
  });

  test('appendEvent deduplicates by event ID', () => {
    appendEvent(makeEvent('evt_1'));
    appendEvent(makeEvent('evt_1'));
    const events = getAllEvents(ENV_ID);
    expect(events).toHaveLength(1);
  });

  test('appendEvent does not cap at 100 events', () => {
    for (let i = 0; i < 150; i++) {
      appendEvent(makeEvent(`evt_${i}`));
    }
    const events = getAllEvents(ENV_ID);
    expect(events).toHaveLength(150);
  });

  test('listEvents returns most recent events first', () => {
    appendEvent({
      ...makeEvent('evt_1'),
      timestamp: '2024-01-01T00:00:01Z',
    });
    appendEvent({
      ...makeEvent('evt_2'),
      timestamp: '2024-01-01T00:00:02Z',
    });
    appendEvent({
      ...makeEvent('evt_3'),
      timestamp: '2024-01-01T00:00:03Z',
    });
    const events = listEvents(ENV_ID, 2);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_3');
    expect(events[1].id).toBe('evt_2');
  });

  test('listEvents defaults to 25', () => {
    for (let i = 0; i < 30; i++) {
      appendEvent(makeEvent(`evt_${i}`));
    }
    const events = listEvents(ENV_ID);
    expect(events).toHaveLength(25);
  });

  test('listEvents returns empty array when no database exists', () => {
    const events = listEvents(ENV_ID);
    expect(events).toEqual([]);
  });

  test('listEvents returns 0 for limit <= 0', () => {
    appendEvent(makeEvent('evt_1'));
    expect(listEvents(ENV_ID, 0)).toEqual([]);
    expect(listEvents(ENV_ID, -1)).toEqual([]);
  });

  test('getEventById returns matching event', () => {
    appendEvent(makeEvent('evt_target', 'video.upload.created'));
    appendEvent(makeEvent('evt_other'));
    const event = getEventById('evt_target', ENV_ID);
    expect(event).toBeDefined();
    expect(event?.id).toBe('evt_target');
    expect(event?.type).toBe('video.upload.created');
  });

  test('getEventById returns undefined for non-existent id', () => {
    appendEvent(makeEvent('evt_1'));
    const event = getEventById('evt_nope', ENV_ID);
    expect(event).toBeUndefined();
  });

  test('getAllEvents returns all stored events in chronological order', () => {
    appendEvent({
      ...makeEvent('evt_1'),
      timestamp: '2024-01-01T00:00:01Z',
    });
    appendEvent({
      ...makeEvent('evt_2'),
      timestamp: '2024-01-01T00:00:02Z',
    });
    const events = getAllEvents(ENV_ID);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_1');
    expect(events[1].id).toBe('evt_2');
  });

  test('stores and retrieves environmentId', () => {
    appendEvent(makeEvent('evt_1', 'video.asset.ready', 'env-abc'));
    const event = getEventById('evt_1', 'env-abc');
    expect(event?.environmentId).toBe('env-abc');
  });

  test('stores and retrieves payload as JSON', () => {
    const payload = { id: 'evt_1', type: 'test', nested: { key: 'value' } };
    appendEvent({ ...makeEvent('evt_1'), payload });
    const event = getEventById('evt_1', ENV_ID);
    expect(event?.payload).toEqual(payload);
  });

  test('queries are scoped to environment', () => {
    appendEvent(makeEvent('evt_1', 'video.asset.ready', 'env-aaa'));
    appendEvent(makeEvent('evt_2', 'video.asset.ready', 'env-bbb'));
    appendEvent(makeEvent('evt_3', 'video.asset.ready', 'env-aaa'));

    expect(listEvents('env-aaa')).toHaveLength(2);
    expect(listEvents('env-bbb')).toHaveLength(1);
    expect(getAllEvents('env-aaa')).toHaveLength(2);
    expect(getAllEvents('env-bbb')).toHaveLength(1);
    expect(getEventById('evt_1', 'env-aaa')).toBeDefined();
    expect(getEventById('evt_1', 'env-bbb')).toBeUndefined();
  });
});
