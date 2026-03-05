import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We need to mock getEventsPath before importing the store
let testDir: string;
let testEventsPath: string;

// Provide all exports so the mock doesn't break other modules that import xdg.ts
const actualXdg = await import('./xdg.ts');
mock.module('./xdg.ts', () => ({
  ...actualXdg,
  getEventsPath: () => testEventsPath,
}));

// Import after mock setup
const { appendEvent, listEvents, getEventById, getAllEvents } = await import(
  './events-store.ts'
);

function makeEvent(
  id: string,
  type = 'video.asset.ready',
  env = 'test-env',
): {
  id: string;
  type: string;
  timestamp: string;
  environmentName: string;
  payload: Record<string, unknown>;
} {
  return {
    id,
    type,
    timestamp: new Date().toISOString(),
    environmentName: env,
    payload: { id, type },
  };
}

describe('events-store', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mux-events-test-'));
    testEventsPath = join(testDir, 'events.json');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test('appendEvent creates file if it does not exist', async () => {
    await appendEvent(makeEvent('evt_1'));
    expect(existsSync(testEventsPath)).toBe(true);
    const content = JSON.parse(await readFile(testEventsPath, 'utf-8'));
    expect(content).toHaveLength(1);
    expect(content[0].id).toBe('evt_1');
  });

  test('appendEvent appends to existing events', async () => {
    await appendEvent(makeEvent('evt_1'));
    await appendEvent(makeEvent('evt_2'));
    const content = JSON.parse(await readFile(testEventsPath, 'utf-8'));
    expect(content).toHaveLength(2);
    expect(content[0].id).toBe('evt_1');
    expect(content[1].id).toBe('evt_2');
  });

  test('appendEvent enforces FIFO cap at 100', async () => {
    // Seed with 100 events
    const events = Array.from({ length: 100 }, (_, i) => makeEvent(`evt_${i}`));
    await writeFile(testEventsPath, JSON.stringify(events));

    // Append one more
    await appendEvent(makeEvent('evt_new'));
    const content = JSON.parse(await readFile(testEventsPath, 'utf-8'));
    expect(content).toHaveLength(100);
    expect(content[0].id).toBe('evt_1'); // evt_0 pruned
    expect(content[99].id).toBe('evt_new');
  });

  test('listEvents returns most recent events first', async () => {
    await appendEvent(makeEvent('evt_1'));
    await appendEvent(makeEvent('evt_2'));
    await appendEvent(makeEvent('evt_3'));
    const events = await listEvents(2);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_3');
    expect(events[1].id).toBe('evt_2');
  });

  test('listEvents defaults to 25', async () => {
    for (let i = 0; i < 30; i++) {
      await appendEvent(makeEvent(`evt_${i}`));
    }
    const events = await listEvents();
    expect(events).toHaveLength(25);
  });

  test('listEvents returns empty array when no file exists', async () => {
    const events = await listEvents();
    expect(events).toEqual([]);
  });

  test('getEventById returns matching event', async () => {
    await appendEvent(makeEvent('evt_target', 'video.upload.created'));
    await appendEvent(makeEvent('evt_other'));
    const event = await getEventById('evt_target');
    expect(event).toBeDefined();
    expect(event?.id).toBe('evt_target');
    expect(event?.type).toBe('video.upload.created');
  });

  test('getEventById returns undefined for non-existent id', async () => {
    await appendEvent(makeEvent('evt_1'));
    const event = await getEventById('evt_nope');
    expect(event).toBeUndefined();
  });

  test('getAllEvents returns all stored events', async () => {
    await appendEvent(makeEvent('evt_1'));
    await appendEvent(makeEvent('evt_2'));
    const events = await getAllEvents();
    expect(events).toHaveLength(2);
  });

  test('handles corrupted file gracefully', async () => {
    await writeFile(testEventsPath, 'not-json');
    const events = await listEvents();
    expect(events).toEqual([]);
  });
});
