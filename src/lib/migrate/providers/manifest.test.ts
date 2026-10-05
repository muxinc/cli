import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourceItem, SourceProvider } from '../types.ts';
import { createManifestProvider } from './manifest.ts';

async function listAll(provider: SourceProvider<void>): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.list(undefined, cursor);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor);
  return items;
}

describe('manifest provider', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-manifest-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function manifest(name: string, content: string) {
    const path = join(tempDir, name);
    await writeFile(path, content);
    return createManifestProvider(path);
  }

  test('reads a JSON manifest', async () => {
    const provider = await manifest(
      'videos.json',
      JSON.stringify([
        {
          id: 'tour',
          url: 'https://cdn.example.com/tour.mp4',
          title: 'Product tour',
          description: 'A walkthrough',
          tags: ['onboarding', 'product'],
          poster_url: 'https://cdn.example.com/tour.jpg',
          passthrough: 'customer-1',
          captions: [
            { url: 'https://cdn.example.com/tour.en.vtt', language: 'en' },
          ],
        },
      ]),
    );

    const [item] = await listAll(provider);

    expect(provider.id).toBe('manifest');
    expect(item).toMatchObject({
      sourceId: 'tour',
      type: 'video',
      exportable: true,
      title: 'Product tour',
      description: 'A walkthrough',
      tags: ['onboarding', 'product'],
      posterUrl: 'https://cdn.example.com/tour.jpg',
      passthrough: 'customer-1',
      sourceUrl: 'https://cdn.example.com/tour.mp4',
      captionCount: 1,
    });
    expect(item.embedPatterns).toContain('https://cdn.example.com/tour.mp4');
  });

  test('reads a CSV manifest with quoted fields, escaped quotes, and a captions column', async () => {
    const captions = JSON.stringify([
      { url: 'https://cdn.example.com/a.en.vtt', language: 'en' },
      { url: 'https://cdn.example.com/a.es.vtt', language: 'es' },
    ]).replaceAll('"', '""');
    const provider = await manifest(
      'videos.csv',
      [
        'id,url,title,tags,captions',
        `a,https://cdn.example.com/a.mp4,"Tour, part ""one""",onboarding;product,"${captions}"`,
        'b,https://cdn.example.com/b.mp4,Second,,',
        '',
      ].join('\n'),
    );

    const [a, b] = await listAll(provider);

    expect(a).toMatchObject({
      sourceId: 'a',
      title: 'Tour, part "one"',
      tags: ['onboarding', 'product'],
      captionCount: 2,
    });
    expect(b).toMatchObject({
      sourceId: 'b',
      title: 'Second',
      captionCount: 0,
    });
    expect(b.tags ?? []).toEqual([]);
  });

  test('derives a stable ID from the URL when id is missing', async () => {
    const content = JSON.stringify([
      { url: 'https://cdn.example.com/a.mp4' },
      { url: 'https://cdn.example.com/b.mp4' },
    ]);
    const [first] = await listAll(await manifest('one.json', content));
    const [again, other] = await listAll(await manifest('two.json', content));

    expect(first.sourceId).toBe(again.sourceId);
    expect(first.sourceId).not.toBe(other.sourceId);
    expect(first.sourceId.length).toBeGreaterThan(0);
  });

  test('resolves to the supplied URL and its captions', async () => {
    const provider = await manifest(
      'videos.json',
      JSON.stringify([
        {
          id: 'a',
          url: 'https://cdn.example.com/a.mp4',
          captions: [
            { url: 'https://cdn.example.com/a.en.vtt', language: 'en' },
          ],
        },
      ]),
    );
    const [item] = await listAll(provider);

    const resolved = await provider.resolve(undefined, item);

    expect(resolved).toMatchObject({
      kind: 'resolved',
      url: 'https://cdn.example.com/a.mp4',
      captions: [
        {
          kind: 'url',
          url: 'https://cdn.example.com/a.en.vtt',
          language: 'en',
          closedCaptions: false,
        },
      ],
    });
  });

  test('rejects a row without a URL and names the row', async () => {
    const provider = await manifest(
      'videos.csv',
      'id,url\na,https://cdn.example.com/a.mp4\nb,\n',
    );

    await expect(listAll(provider)).rejects.toMatchObject({
      code: 'MANIFEST_URL_MISSING',
      message: expect.stringContaining('3'),
    });
  });

  test('rejects duplicate IDs', async () => {
    const provider = await manifest(
      'videos.json',
      JSON.stringify([
        { id: 'a', url: 'https://cdn.example.com/a.mp4' },
        { id: 'a', url: 'https://cdn.example.com/b.mp4' },
      ]),
    );

    await expect(listAll(provider)).rejects.toMatchObject({
      code: 'MANIFEST_DUPLICATE_ID',
    });
  });

  test('rejects an unsupported file type', async () => {
    const provider = await manifest(
      'videos.txt',
      'https://cdn.example.com/a.mp4',
    );

    await expect(listAll(provider)).rejects.toMatchObject({
      code: 'MANIFEST_FORMAT_UNSUPPORTED',
    });
  });

  test('verify fails when the manifest file does not exist', async () => {
    const provider = createManifestProvider(join(tempDir, 'missing.json'));

    const result = await provider.verify();

    expect(result.ok).toBe(false);
    expect(result.warnings[0]?.code).toBe('MANIFEST_NOT_FOUND');
  });
});
