import { describe, expect, test } from 'bun:test';
import { noSleep, routeFetch } from '../testing/route-fetch.ts';
import type { SourceItem } from '../types.ts';
import {
  type BucketCredentials,
  type BucketSourceOptions,
  createBucketProvider,
} from './bucket.ts';

const creds: BucketCredentials = {
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
  region: 'us-west-2',
};
const now = new Date('2026-10-05T12:00:00Z');
const HOST = 'media.s3.us-west-2.amazonaws.com';

interface FakeObject {
  key: string;
  size?: number;
  lastModified?: string;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function listing(objects: FakeObject[], nextToken?: string) {
  const contents = objects
    .map(
      (o) =>
        `<Contents><Key>${escapeXml(o.key)}</Key><LastModified>${o.lastModified ?? '2024-01-02T03:04:05.000Z'}</LastModified><Size>${o.size ?? 1000}</Size></Contents>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>${nextToken ? 'true' : 'false'}</IsTruncated>${nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : ''}${contents}</ListBucketResult>`,
  );
}

/** Serves ListObjectsV2 pages keyed by continuation token, plus object bodies by key. */
function bucket(
  pages: Record<string, { objects: FakeObject[]; next?: string }>,
  bodies: Record<string, string> = {},
  source: Partial<BucketSourceOptions> = {},
) {
  const routes: Parameters<typeof routeFetch>[0] = {
    [`GET ${HOST}/`]: (url) => {
      const page = pages[url.searchParams.get('continuation-token') ?? ''];
      return listing(page.objects, page.next);
    },
  };
  for (const [key, body] of Object.entries(bodies)) {
    routes[`GET ${HOST}/${key}`] = () => new Response(body);
  }
  const { fetch, requests } = routeFetch(routes);
  return {
    provider: createBucketProvider({
      source: { bucket: 'media', ...source },
      fetch,
      sleep: noSleep,
      now: () => now,
    }),
    requests,
  };
}

async function listAll(p: ReturnType<typeof bucket>['provider']) {
  const items: SourceItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await p.list(creds, cursor);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor);
  return items;
}

describe('bucket provider', () => {
  test('reads credentials from the AWS environment variables', () => {
    const { provider: p } = bucket({});

    expect(
      p.credentials.read({
        AWS_ACCESS_KEY_ID: 'AKID',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_REGION: 'auto',
        AWS_SESSION_TOKEN: 'token',
        AWS_ENDPOINT_URL: 'https://account.r2.cloudflarestorage.com',
      }),
    ).toEqual({
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
      region: 'auto',
      sessionToken: 'token',
      endpoint: 'https://account.r2.cloudflarestorage.com',
    });
    expect(() =>
      p.credentials.read({ AWS_ACCESS_KEY_ID: 'AKID', AWS_REGION: 'auto' }),
    ).toThrow(
      expect.objectContaining({
        code: 'BUCKET_CREDENTIALS_MISSING',
        message: expect.stringContaining('AWS_SECRET_ACCESS_KEY'),
      }),
    );
  });

  describe('verify', () => {
    test('lists one key under the prefix', async () => {
      const { provider: p, requests } = bucket(
        { '': { objects: [{ key: 'videos/a.mp4' }] } },
        {},
        { prefix: 'videos/' },
      );

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests[0].url.searchParams.get('max-keys')).toBe('1');
      expect(requests[0].url.searchParams.get('prefix')).toBe('videos/');
    });

    test('fails with BUCKET_NAME_REQUIRED without a bucket', async () => {
      const p = createBucketProvider({ source: {} as BucketSourceOptions });

      const result = await p.verify(creds);

      expect(result.ok).toBe(false);
      expect(result.warnings[0]).toMatchObject({
        code: 'BUCKET_NAME_REQUIRED',
        hint: expect.stringContaining('source.bucket'),
      });
      await expect(p.list(creds)).rejects.toMatchObject({
        code: 'BUCKET_NAME_REQUIRED',
      });
    });

    test.each([
      [403, 'AccessDenied', 'BUCKET_UNAUTHORIZED'],
      [404, 'NoSuchBucket', 'BUCKET_NOT_FOUND'],
    ])('reports HTTP %d %s as %s with a hint', async (status, s3Code, code) => {
      const { fetch } = routeFetch({
        [`GET ${HOST}/`]: () =>
          new Response(
            `<Error><Code>${s3Code}</Code><Message>Denied</Message></Error>`,
            { status },
          ),
      });
      const p = createBucketProvider({
        source: { bucket: 'media' },
        fetch,
        now: () => now,
      });

      const result = await p.verify(creds);

      expect(result).toMatchObject({
        ok: false,
        warnings: [{ code, hint: expect.any(String) }],
      });
    });
  });

  describe('list', () => {
    test('maps media objects and ignores other files', async () => {
      const { provider: p } = bucket({
        '': {
          objects: [
            { key: 'notes.txt' },
            {
              key: 'videos/Intro Talk.MP4',
              size: 1048576,
              lastModified: '2024-05-06T07:08:09.000Z',
            },
            { key: 'videos/podcast.mp3' },
            { key: 'videos/thumb.jpg' },
            { key: 'videos/' },
          ],
        },
      });

      const items = await listAll(p);

      expect(items.map((i) => i.sourceId)).toEqual([
        'videos/Intro Talk.MP4',
        'videos/podcast.mp3',
      ]);
      expect(items[0]).toMatchObject({
        sourceId: 'videos/Intro Talk.MP4',
        type: 'video',
        exportable: true,
        title: 'Intro Talk',
        folder: 'videos',
        sizeBytes: 1048576,
        createdAt: '2024-05-06T07:08:09.000Z',
        expectedFidelity: 'original',
        captionCount: 0,
      });
      expect(items[0].embedPatterns).toEqual([
        'videos/Intro Talk.MP4',
        `${HOST}/videos/Intro%20Talk.MP4`,
        's3.us-west-2.amazonaws.com/media/videos/Intro%20Talk.MP4',
      ]);
      expect(items[1].type).toBe('audio');
    });

    test('follows continuation tokens', async () => {
      const { provider: p, requests } = bucket(
        {
          '': { objects: [{ key: 'a.mp4' }], next: 'token-2' },
          'token-2': { objects: [{ key: 'b.mov' }] },
        },
        {},
        { prefix: 'uploads/' },
      );

      const items = await listAll(p);

      expect(items.map((i) => i.sourceId)).toEqual(['a.mp4', 'b.mov']);
      expect(requests[1].url.searchParams.get('continuation-token')).toBe(
        'token-2',
      );
      expect(requests[1].url.searchParams.get('prefix')).toBe('uploads/');
    });

    test('filters by the recipe extensions and glob', async () => {
      const { provider: p } = bucket(
        {
          '': {
            objects: [
              { key: 'final/a.mov' },
              { key: 'final/b.mp4' },
              { key: 'final/nested/c.mov' },
              { key: 'drafts/d.mov' },
            ],
          },
        },
        {},
        { extensions: ['.MOV'], glob: 'final/**' },
      );

      const items = await listAll(p);

      expect(items.map((i) => i.sourceId)).toEqual([
        'final/a.mov',
        'final/nested/c.mov',
      ]);
    });

    test('marks empty objects as not exportable', async () => {
      const { provider: p } = bucket({
        '': { objects: [{ key: 'empty.mp4', size: 0 }] },
      });

      const [item] = await listAll(p);

      expect(item.exportable).toBe(false);
      expect(item.skipReason).toMatch(/empty/i);
    });

    test('applies JSON sidecar metadata and caption sidecars', async () => {
      const { provider: p, requests } = bucket(
        {
          '': {
            objects: [
              { key: 'v/talk.en.vtt' },
              { key: 'v/talk.es-MX.srt' },
              { key: 'v/talk.mp4' },
              { key: 'v/talk.mp4.json' },
              { key: 'v/other.mp4' },
            ],
          },
        },
        {
          'v/talk.mp4.json': JSON.stringify({
            title: 'Keynote',
            description: 'Opening keynote',
            tags: ['conference', 'keynote'],
            passthrough: 'cms-42',
          }),
        },
      );

      const items = await listAll(p);

      expect(items.map((i) => i.sourceId)).toEqual([
        'v/talk.mp4',
        'v/other.mp4',
      ]);
      expect(items[0]).toMatchObject({
        title: 'Keynote',
        description: 'Opening keynote',
        tags: ['conference', 'keynote'],
        passthrough: 'cms-42',
        captionCount: 2,
        captionLanguages: ['en', 'es-MX'],
      });
      expect(items[1]).toMatchObject({ title: 'other', captionCount: 0 });
      const sidecarReads = requests.filter((r) => r.url.pathname !== '/');
      expect(sidecarReads.map((r) => r.url.pathname)).toEqual([
        '/v/talk.mp4.json',
      ]);
    });

    test('keeps sidecars that land on the next page with their video', async () => {
      const { provider: p } = bucket(
        {
          '': {
            objects: [
              { key: 'a.mp4' },
              { key: 'talk.en.vtt' },
              { key: 'talk.mp4' },
            ],
            next: 'token-2',
          },
          'token-2': {
            objects: [{ key: 'talk.mp4.json' }, { key: 'zebra.mp4' }],
          },
        },
        { 'talk.mp4.json': '{"title":"Keynote"}' },
      );

      const items = await listAll(p);

      expect(items.map((i) => [i.sourceId, i.title, i.captionCount])).toEqual([
        ['a.mp4', 'a', 0],
        ['talk.mp4', 'Keynote', 1],
        ['zebra.mp4', 'zebra', 0],
      ]);
    });

    test('warns with BUCKET_SIDECAR_INVALID for an unreadable JSON sidecar', async () => {
      const { provider: p } = bucket(
        { '': { objects: [{ key: 'a.mp4' }, { key: 'a.mp4.json' }] } },
        { 'a.mp4.json': '{not json' },
      );

      const page = await p.list(creds);

      expect(page.items[0].title).toBe('a');
      expect(page.warnings).toEqual([
        expect.objectContaining({
          code: 'BUCKET_SIDECAR_INVALID',
          message: expect.stringContaining('a.mp4.json'),
        }),
      ]);
    });
  });

  describe('resolve', () => {
    async function listedItem(source: Partial<BucketSourceOptions> = {}) {
      const { provider: p } = bucket(
        {
          '': {
            objects: [{ key: 'v/talk.en.vtt' }, { key: 'v/talk.mp4' }],
          },
        },
        {},
        source,
      );
      const [item] = await listAll(p);
      return { p, item };
    }

    test('presigns the object and caption sidecars just in time', async () => {
      const { p, item } = await listedItem();

      const result = await p.resolve(creds, item);

      if (result.kind !== 'resolved') throw new Error('Expected resolved');
      const url = new URL(result.url);
      expect(`${url.host}${url.pathname}`).toBe(`${HOST}/v/talk.mp4`);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('86400');
      expect(url.searchParams.get('X-Amz-Date')).toBe('20261005T120000Z');
      expect(result.fidelity).toBe('original');
      expect(result.expiresAt).toEqual(new Date('2026-10-06T12:00:00Z'));
      expect(result.captions).toEqual([
        {
          kind: 'url',
          url: expect.stringContaining(`${HOST}/v/talk.en.vtt?X-Amz-`),
          language: 'en',
          closedCaptions: false,
        },
      ]);
    });

    test('uses url_ttl_seconds, capped at seven days', async () => {
      const short = await listedItem({ url_ttl_seconds: 7200 });
      const long = await listedItem({ url_ttl_seconds: 30 * 86400 });

      const a = await short.p.resolve(creds, short.item);
      const b = await long.p.resolve(creds, long.item);

      expect(a).toMatchObject({ expiresAt: new Date('2026-10-05T14:00:00Z') });
      expect(b).toMatchObject({ expiresAt: new Date('2026-10-12T12:00:00Z') });
    });
  });
});
