import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { noSleep, routeFetch } from '../testing/route-fetch.ts';
import type { SourceItem } from '../types.ts';
import { type BunnySourceOptions, createBunnyProvider } from './bunny.ts';

const LIBRARY = '/library/lib1';
const CDN = 'vz-abc123.b-cdn.net';
const NOW = 1_700_000_000_000;
const EXPIRES = 1_700_000_000 + 24 * 60 * 60;

const creds = { libraryId: 'lib1', apiKey: 'bunny-key' };
const signedCreds = { ...creds, cdnTokenKey: 'token-key' };

function video(guid: string, overrides: Record<string, unknown> = {}) {
  return {
    videoLibraryId: 1,
    guid,
    title: `Video ${guid}`,
    description: 'A description',
    dateUploaded: '2024-01-02T03:04:05.123',
    length: 184,
    status: 4,
    storageSize: 1234567,
    thumbnailFileName: 'thumbnail.jpg',
    hasOriginal: true,
    hasMP4Fallback: true,
    availableResolutions: '360p,720p,1080p',
    collectionId: '',
    chapters: [{ title: 'Intro', start: 0, end: 30 }],
    captions: [{ srclang: 'en', label: 'English', version: 1 }],
    ...overrides,
  };
}

function playData(guid: string, overrides: Record<string, unknown> = {}) {
  return {
    video: video(guid),
    captionsPath: `https://${CDN}/${guid}/captions/`,
    seekPath: `https://${CDN}/${guid}/seek/_0.jpg`,
    thumbnailUrl: `https://${CDN}/${guid}/thumbnail.jpg`,
    fallbackUrl: `https://${CDN}/${guid}/play_`,
    videoPlaylistUrl: `https://${CDN}/${guid}/playlist.m3u8`,
    originalUrl: `https://${CDN}/${guid}/original`,
    tokenAuthEnabled: false,
    enableMP4Fallback: true,
    ...overrides,
  };
}

function page(items: unknown[], currentPage: number, totalItems: number) {
  return { totalItems, currentPage, itemsPerPage: 100, items };
}

function provider(
  routes: Parameters<typeof routeFetch>[0],
  source: BunnySourceOptions = {},
) {
  const { fetch, requests } = routeFetch(routes);
  return {
    provider: createBunnyProvider({
      source,
      fetch,
      sleep: noSleep,
      now: () => NOW,
    }),
    requests,
  };
}

async function listAll(
  p: ReturnType<typeof provider>['provider'],
  c: typeof creds = creds,
) {
  const items: SourceItem[] = [];
  let cursor: string | undefined;
  do {
    const result = await p.list(c, cursor);
    items.push(...result.items);
    cursor = result.next;
  } while (cursor);
  return items;
}

/** Bunny's documented advanced token: HS256- + Base64URL(HMAC-SHA256(key, path + expires)). */
function expectedToken(key: string, path: string, expires: number) {
  return `HS256-${createHmac('sha256', key)
    .update(`${path}${expires}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`;
}

describe('bunny provider', () => {
  test('reads credentials from the environment', () => {
    const { provider: p } = provider({});

    expect(
      p.credentials.read({
        BUNNY_STREAM_LIBRARY_ID: 'lib1',
        BUNNY_STREAM_API_KEY: 'key',
        BUNNY_CDN_TOKEN_KEY: 'token',
      }),
    ).toEqual({ libraryId: 'lib1', apiKey: 'key', cdnTokenKey: 'token' });
    expect(
      p.credentials.read({
        BUNNY_STREAM_LIBRARY_ID: 'lib1',
        BUNNY_STREAM_API_KEY: 'key',
      }),
    ).toEqual({ libraryId: 'lib1', apiKey: 'key', cdnTokenKey: undefined });
    expect(() =>
      p.credentials.read({ BUNNY_STREAM_LIBRARY_ID: 'lib1' }),
    ).toThrow(
      expect.objectContaining({
        code: 'BUNNY_CREDENTIALS_MISSING',
        message: expect.stringContaining('BUNNY_STREAM_API_KEY'),
      }),
    );
  });

  describe('verify', () => {
    test('passes when the API key works and a finished video is reachable', async () => {
      const { provider: p, requests } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
        [`HEAD ${CDN}/a/original`]: () => new Response(null, { status: 200 }),
      });

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests[0].url.host).toBe('video.bunnycdn.com');
      expect(requests[0].headers.AccessKey).toBe('bunny-key');
      expect(requests[0].url.searchParams.get('page')).toBe('1');
      const head = requests.find((r) => r.method === 'HEAD');
      expect(head?.headers.AccessKey).toBeUndefined();
    });

    test('skips the direct access check when no video has finished processing', async () => {
      const { provider: p, requests } = provider({
        [`GET ${LIBRARY}/videos`]: () =>
          page([video('a', { status: 3 })], 1, 1),
      });

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests).toHaveLength(1);
    });

    test('fails with BUNNY_UNAUTHORIZED and a hint for a rejected API key', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () =>
          new Response('{"Message":"Unauthorized"}', { status: 401 }),
      });

      const result = await p.verify(creds);

      expect(result).toMatchObject({
        ok: false,
        warnings: [
          {
            code: 'BUNNY_UNAUTHORIZED',
            hint: expect.stringContaining('BUNNY_STREAM_API_KEY'),
          },
        ],
      });
    });

    test('fails with BUNNY_DIRECT_ACCESS_BLOCKED when the CDN returns 403', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
        [`HEAD ${CDN}/a/original`]: () => new Response(null, { status: 403 }),
      });

      const result = await p.verify(creds);

      expect(result.ok).toBe(false);
      expect(result.warnings[0]).toMatchObject({
        code: 'BUNNY_DIRECT_ACCESS_BLOCKED',
        hint: expect.stringContaining('BUNNY_CDN_TOKEN_KEY'),
      });
    });

    test('checks direct access with a signed URL when the token key is set', async () => {
      const { provider: p, requests } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
        [`HEAD ${CDN}/a/original`]: () => new Response(null, { status: 200 }),
      });

      expect(await p.verify(signedCreds)).toEqual({ ok: true, warnings: [] });
      const head = requests.find((r) => r.method === 'HEAD');
      expect(head?.url.searchParams.get('token')).toBe(
        expectedToken('token-key', '/a/original', EXPIRES),
      );
    });
  });

  describe('list', () => {
    test('pages by totalItems and stops after a final partial page', async () => {
      const first = Array.from({ length: 100 }, (_, i) => video(`p1-${i}`));
      const { provider: p, requests } = provider({
        [`GET ${LIBRARY}/videos`]: (url) =>
          url.searchParams.get('page') === '2'
            ? page([video('p2-0'), video('p2-1')], 2, 102)
            : page(first, 1, 102),
        [`GET ${LIBRARY}/videos/p1-0/play`]: () => playData('p1-0'),
      });

      const items = await listAll(p);

      expect(items).toHaveLength(102);
      const listCalls = requests.filter((r) =>
        r.url.pathname.endsWith('/videos'),
      );
      expect(listCalls.map((r) => r.url.searchParams.get('page'))).toEqual([
        '1',
        '2',
      ]);
      expect(listCalls[0].url.searchParams.get('itemsPerPage')).toBe('100');
      expect(listCalls[0].headers.AccessKey).toBe('bunny-key');
    });

    test('returns no next cursor when the first page holds every item', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
      });

      expect((await p.list(creds)).next).toBeUndefined();
    });

    test('maps each video', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
      });

      const [item] = await listAll(p);

      expect(item).toMatchObject({
        sourceId: 'a',
        type: 'video',
        exportable: true,
        title: 'Video a',
        description: 'A description',
        durationSeconds: 184,
        sizeBytes: 1234567,
        createdAt: '2024-01-02T03:04:05.123Z',
        sourceUrl: 'https://player.mediadelivery.net/play/lib1/a',
        posterUrl: `https://${CDN}/a/thumbnail.jpg`,
        chapters: [{ title: 'Intro', startSeconds: 0 }],
        captionCount: 1,
        captionLanguages: ['en'],
        expectedFidelity: 'original',
      });
      expect(item.embedPatterns).toEqual([
        'player.mediadelivery.net/embed/lib1/a',
        'player.mediadelivery.net/play/lib1/a',
        'iframe.mediadelivery.net/embed/lib1/a',
        'iframe.mediadelivery.net/play/lib1/a',
        'video.bunnycdn.com/play/lib1/a',
        `${CDN}/a`,
      ]);
    });

    test('expects a rendition when Bunny did not keep the original', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () =>
          page([video('a', { hasOriginal: false })], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
      });

      const [item] = await listAll(p);

      expect(item.expectedFidelity).toBe('rendition');
    });

    test('omits CDN-derived fields when the CDN hostname cannot be determined', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () =>
          new Response('{"Message":"Not found"}', { status: 404 }),
      });

      const [item] = await listAll(p);

      expect(item.posterUrl).toBeUndefined();
      expect(item.embedPatterns).not.toContain(`${CDN}/a`);
    });

    test('exports only finished videos, with a reason for the rest', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () =>
          page(
            [
              video('created', { status: 0 }),
              video('uploaded', { status: 1 }),
              video('processing', { status: 2 }),
              video('transcoding', { status: 3 }),
              video('finished', { status: 4 }),
              video('error', { status: 5 }),
              video('upload-failed', { status: 6 }),
            ],
            1,
            7,
          ),
        [`GET ${LIBRARY}/videos/finished/play`]: () => playData('finished'),
      });

      const items = await listAll(p);

      expect(items.filter((i) => i.exportable).map((i) => i.sourceId)).toEqual([
        'finished',
      ]);
      const reasons = Object.fromEntries(
        items.map((i) => [i.sourceId, i.skipReason]),
      );
      expect(reasons.created).toMatch(/not been uploaded/i);
      expect(reasons.uploaded).toMatch(/processing/i);
      expect(reasons.transcoding).toMatch(/processing/i);
      expect(reasons.error).toMatch(/encoding failed/i);
      expect(reasons['upload-failed']).toMatch(/upload failed/i);
    });

    test('filters by collection from the recipe', async () => {
      const { provider: p, requests } = provider(
        {
          [`GET ${LIBRARY}/videos`]: () => page([], 1, 0),
        },
        { collection: 'col-1' },
      );

      await listAll(p);

      expect(requests[0].url.searchParams.get('collection')).toBe('col-1');
    });

    test('signs the poster URL when the token key is set', async () => {
      const { provider: p } = provider({
        [`GET ${LIBRARY}/videos`]: () => page([video('a')], 1, 1),
        [`GET ${LIBRARY}/videos/a/play`]: () => playData('a'),
      });

      const [item] = await listAll(p, signedCreds);

      expect(item.posterUrl).toBe(
        `https://${CDN}/a/thumbnail.jpg?token=${expectedToken('token-key', '/a/thumbnail.jpg', EXPIRES)}&expires=${EXPIRES}`,
      );
    });
  });

  describe('resolve', () => {
    function item(overrides: Record<string, unknown> = {}): SourceItem {
      return {
        sourceId: 'a',
        type: 'video',
        exportable: true,
        embedPatterns: [],
        captionCount: 1,
        raw: video('a', overrides),
      };
    }

    function resolveWith(
      play: Record<string, unknown>,
      c: typeof creds = creds,
    ) {
      const { fetch, requests } = routeFetch({
        [`GET ${LIBRARY}/videos/a/play`]: () => play,
      });
      const p = createBunnyProvider({ fetch, sleep: noSleep, now: () => NOW });
      return { result: p.resolve(c, item()), requests };
    }

    test('uses the original file when Bunny kept it', async () => {
      const { result, requests } = resolveWith(playData('a'));

      expect(await result).toMatchObject({
        kind: 'resolved',
        url: `https://${CDN}/a/original`,
        fidelity: 'original',
      });
      expect(requests[0].headers.AccessKey).toBe('bunny-key');
    });

    test('falls back to the highest MP4 rendition without an original', async () => {
      const { result } = resolveWith(
        playData('a', {
          video: video('a', {
            hasOriginal: false,
            availableResolutions: '240p,1080p,720p,360p',
          }),
        }),
      );

      expect(await result).toMatchObject({
        kind: 'resolved',
        url: `https://${CDN}/a/play_1080p.mp4`,
        fidelity: 'rendition',
      });
    });

    test('caps the MP4 fallback at 1080p, which is the highest Bunny generates', async () => {
      const { result } = resolveWith(
        playData('a', {
          video: video('a', {
            hasOriginal: false,
            availableResolutions: '720p,1080p,1440p,2160p',
          }),
        }),
      );

      expect(await result).toMatchObject({
        url: `https://${CDN}/a/play_1080p.mp4`,
      });
    });

    test('is unavailable with BUNNY_NO_ORIGINAL_OR_MP4 without an original or MP4 fallback', async () => {
      const { result } = resolveWith(
        playData('a', {
          originalUrl: '',
          enableMP4Fallback: false,
          video: video('a', { hasOriginal: false, hasMP4Fallback: false }),
        }),
      );

      expect(await result).toMatchObject({
        kind: 'unavailable',
        code: 'BUNNY_NO_ORIGINAL_OR_MP4',
      });
    });

    test('returns caption URLs on the CDN with BCP 47 languages', async () => {
      const { result } = resolveWith(
        playData('a', {
          video: video('a', {
            captions: [
              { srclang: 'en', label: 'English', version: 1 },
              { srclang: 'pt_br', label: 'Português', version: 2 },
            ],
          }),
        }),
      );

      expect(await result).toMatchObject({
        captions: [
          {
            kind: 'url',
            url: `https://${CDN}/a/captions/en.vtt`,
            language: 'en',
            label: 'English',
            closedCaptions: false,
          },
          {
            kind: 'url',
            url: `https://${CDN}/a/captions/pt_br.vtt`,
            language: 'pt-BR',
            label: 'Português',
            closedCaptions: false,
          },
        ],
      });
    });

    test('signs media and caption URLs with CDN token authentication', async () => {
      const { result } = resolveWith(playData('a'), signedCreds);

      const resolved = await result;

      expect(resolved).toMatchObject({
        kind: 'resolved',
        url: `https://${CDN}/a/original?token=${expectedToken('token-key', '/a/original', EXPIRES)}&expires=${EXPIRES}`,
        expiresAt: new Date(EXPIRES * 1000),
        captions: [
          {
            url: `https://${CDN}/a/captions/en.vtt?token=${expectedToken('token-key', '/a/captions/en.vtt', EXPIRES)}&expires=${EXPIRES}`,
          },
        ],
      });
    });

    test('the expected token formula matches a published Bunny test vector', () => {
      expect(expectedToken('SecurityKey', '/abc/', 1598024587)).toBe(
        'HS256-bTMv4RVOkjx2UXLfVDl-JIygaxfSIQP8UCnCy7CILuY',
      );
    });
  });
});
