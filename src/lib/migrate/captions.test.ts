import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalCaptionStore } from './captions.ts';

describe('createLocalCaptionStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-captions-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes each caption under captions/ with a safe file name', async () => {
    const store = createLocalCaptionStore(dir);

    const path = await store.saveLocal('folder/video 1', {
      kind: 'text',
      text: 'WEBVTT\n',
      format: 'vtt',
      language: 'en',
      closedCaptions: false,
    });

    expect(path).toBe(join(dir, 'captions', 'folder_video_1.en.vtt'));
    expect(await readFile(path, 'utf-8')).toBe('WEBVTT\n');
  });
});
