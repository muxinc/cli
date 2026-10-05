import { describe, expect, test } from 'bun:test';
import { noSleep, routeFetch } from '../testing/route-fetch.ts';
import type { SourceItem } from '../types.ts';
import {
  createWistiaProvider,
  WISTIA_API_VERSION,
  type WistiaSourceOptions,
} from './wistia.ts';

const creds = { apiToken: 'wistia-token' };

function asset(type: string, overrides: Record<string, unknown> = {}) {
  return {
    url: `https://embed-ssl.wistia.com/deliveries/${type.toLowerCase()}.bin`,
    width: 1280,
    height: 720,
    file_size: 1000,
    content_type: 'video/mp4',
    type,
    ...overrides,
  };
}

function media(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    hashed_id: id,
    name: `Video ${id}`,
    type: 'Video',
    description: '<p>A <strong>product</strong> tour &amp; more</p>',
    duration: 184.2,
    created: '2024-01-02T03:04:05+00:00',
    status: 'ready',
    thumbnail: {
      url: `https://embed-ssl.wistia.com/deliveries/${id}-thumb.jpg`,
    },
    folder: { id: 7, name: 'Marketing', hashed_id: 'fold123' },
    tags: [{ name: 'onboarding' }],
    assets: [asset('OriginalFile', { file_size: 5000 })],
    ...overrides,
  };
}

function provider(
  routes: Parameters<typeof routeFetch>[0],
  source: WistiaSourceOptions = {},
) {
  const { fetch, requests } = routeFetch(routes);
  return {
    provider: createWistiaProvider({ source, fetch, sleep: noSleep }),
    requests,
  };
}

async function listAll(p: ReturnType<typeof provider>['provider']) {
  const items: SourceItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await p.list(creds, cursor);
    items.push(...page.items);
    cursor = page.next;
  } while (cursor);
  return items;
}

describe('wistia provider', () => {
  test('reads the API token from WISTIA_API_TOKEN', () => {
    const { provider: p } = provider({});

    expect(p.credentials.read({ WISTIA_API_TOKEN: 'abc' })).toEqual({
      apiToken: 'abc',
    });
    expect(() => p.credentials.read({})).toThrow(
      expect.objectContaining({ code: 'WISTIA_CREDENTIALS_MISSING' }),
    );
  });

  describe('verify', () => {
    test('passes when the token can read media, sending the pinned version', async () => {
      const { provider: p, requests } = provider({
        'GET /modern/medias': () => [media('abc')],
      });

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests[0].url.host).toBe('api.wistia.com');
      expect(requests[0].url.searchParams.get('per_page')).toBe('1');
      expect(requests[0].headers.Authorization).toBe('Bearer wistia-token');
      expect(requests[0].headers['X-Wistia-API-Version']).toBe(
        WISTIA_API_VERSION,
      );
    });

    test('fails with WISTIA_UNAUTHORIZED and a hint for a rejected token', async () => {
      const { provider: p } = provider({
        'GET /modern/medias': () =>
          new Response(
            '{"code":"unauthorized_credentials","error":"Invalid credentials."}',
            { status: 401 },
          ),
      });

      const result = await p.verify(creds);

      expect(result).toMatchObject({
        ok: false,
        warnings: [
          {
            code: 'WISTIA_UNAUTHORIZED',
            message: expect.stringContaining('Invalid credentials.'),
            hint: expect.stringContaining('API'),
          },
        ],
      });
    });
  });

  describe('list', () => {
    test('pages until a short page and maps each video', async () => {
      const full = Array.from({ length: 100 }, (_, i) => media(`p1-${i}`));
      const { provider: p, requests } = provider({
        'GET /modern/medias': (url) =>
          url.searchParams.get('page') === '2' ? [media('last')] : full,
      });

      const items = await listAll(p);

      expect(items).toHaveLength(101);
      expect(requests).toHaveLength(2);
      expect(requests[0].url.searchParams.get('type')).toBe('Video');
      expect(requests[0].url.searchParams.get('per_page')).toBe('100');
      expect(requests[0].url.searchParams.get('page')).toBe('1');
      expect(requests[1].url.searchParams.get('page')).toBe('2');
      expect(items[100]).toMatchObject({
        sourceId: 'last',
        type: 'video',
        exportable: true,
        title: 'Video last',
        description: 'A product tour & more',
        tags: ['onboarding'],
        folder: 'Marketing',
        durationSeconds: 184.2,
        sizeBytes: 5000,
        createdAt: '2024-01-02T03:04:05+00:00',
        posterUrl: 'https://embed-ssl.wistia.com/deliveries/last-thumb.jpg',
        captionCount: 0,
        expectedFidelity: 'original',
      });
      expect(items[100].embedPatterns).toEqual([
        'fast.wistia.net/embed/iframe/last',
        'fast.wistia.com/embed/medias/last',
        'wistia.com/medias/last',
        'wistia_async_last',
        'wi.st/medias/last',
      ]);
    });

    test('stops after an empty first page', async () => {
      const { provider: p } = provider({ 'GET /modern/medias': () => [] });

      expect(await p.list(creds)).toEqual({ items: [], next: undefined });
    });

    test('leaves expected fidelity unset when no original is listed', async () => {
      const { provider: p } = provider({
        'GET /modern/medias': () => [
          media('rendition', { assets: [asset('HdMp4VideoFile')] }),
          media('none', { assets: undefined }),
        ],
      });

      const items = await listAll(p);

      expect(items.map((i) => i.expectedFidelity)).toEqual([
        undefined,
        undefined,
      ]);
      expect(items[1].exportable).toBe(true);
    });

    test('marks media that are not ready as not exportable', async () => {
      const { provider: p } = provider({
        'GET /modern/medias': () => [
          media('ok'),
          media('queued', { status: 'queued' }),
          media('processing', { status: 'processing' }),
          media('failed', { status: 'failed' }),
        ],
      });

      const items = await listAll(p);

      expect(items.map((i) => [i.sourceId, i.exportable])).toEqual([
        ['ok', true],
        ['queued', false],
        ['processing', false],
        ['failed', false],
      ]);
      expect(items[1].skipReason).toMatch(/processing/i);
      expect(items[3].skipReason).toMatch(/failed/i);
    });

    test('filters by folder name or hashed ID from the recipe', async () => {
      const { provider: p } = provider(
        {
          'GET /modern/medias': () => [
            media('a'),
            media('b', {
              folder: { id: 8, name: 'Internal', hashed_id: 'fold456' },
            }),
            media('c', {
              folder: { id: 9, name: 'Sales', hashed_id: 'fold789' },
            }),
            media('d', { folder: null }),
          ],
        },
        { folders: ['Marketing', 'fold789'] },
      );

      const items = await listAll(p);

      expect(items.filter((i) => i.exportable).map((i) => i.sourceId)).toEqual([
        'a',
        'c',
      ]);
      expect(items[1].skipReason).toMatch(/folder/i);
    });
  });

  describe('resolve', () => {
    const item = {
      sourceId: 'abc',
      type: 'video',
      exportable: true,
      embedPatterns: [],
      captionCount: 0,
      raw: {},
    } as SourceItem;

    function resolveWith(
      body: Record<string, unknown>,
      captions: unknown[] = [],
    ) {
      return provider({
        'GET /modern/medias/abc': () => ({ hashed_id: 'abc', ...body }),
        'GET /modern/medias/abc/captions': () => captions,
      }).provider.resolve(creds, item);
    }

    test('uses the OriginalFile asset and reports original fidelity', async () => {
      const result = await resolveWith({
        assets: [
          asset('HdMp4VideoFile', { file_size: 9000 }),
          asset('OriginalFile', { file_size: 5000 }),
          asset('StillImageFile', { content_type: 'image/jpeg' }),
        ],
      });

      expect(result).toEqual({
        kind: 'resolved',
        url: 'https://embed-ssl.wistia.com/deliveries/originalfile.bin',
        fidelity: 'original',
        captions: [],
      });
    });

    test('falls back to the largest mp4 rendition', async () => {
      const result = await resolveWith({
        assets: [
          asset('MdMp4VideoFile', { width: 960, height: 540, file_size: 400 }),
          asset('HdMp4VideoFile', {
            width: 1920,
            height: 1080,
            file_size: 900,
          }),
          asset('IPhoneVideoFile', { width: 640, height: 360, file_size: 100 }),
          asset('StillImageFile', {
            width: 3840,
            height: 2160,
            content_type: 'image/jpeg',
          }),
        ],
      });

      expect(result).toMatchObject({
        kind: 'resolved',
        url: 'https://embed-ssl.wistia.com/deliveries/hdmp4videofile.bin',
        fidelity: 'rendition',
      });
    });

    test('is unavailable with WISTIA_NO_DOWNLOADABLE_ASSET for empty, missing, or unusable assets', async () => {
      for (const body of [
        { assets: [] },
        {},
        { assets: null },
        {
          assets: [asset('StillImageFile'), asset('OriginalFile', { url: '' })],
        },
      ]) {
        expect(await resolveWith(body)).toMatchObject({
          kind: 'unavailable',
          code: 'WISTIA_NO_DOWNLOADABLE_ASSET',
        });
      }
    });

    test('returns captions as SRT text with BCP 47 languages', async () => {
      const result = await resolveWith({ assets: [asset('OriginalFile')] }, [
        {
          language: 'eng',
          english_name: 'English',
          native_name: 'English',
          text: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
          is_draft: false,
        },
        {
          language: 'spa',
          english_name: 'Spanish',
          native_name: 'Español',
          text: '1\n00:00:00,000 --> 00:00:01,000\nHola\n',
        },
        { language: 'fre', english_name: 'French', text: 'srt' },
        { language: 'ger', english_name: 'German', text: 'srt' },
        { language: 'zho', english_name: 'Chinese', text: 'srt' },
        { language: 'pt', english_name: 'Portuguese', text: 'srt' },
        { language: 'haw', english_name: 'Hawaiian', text: 'srt' },
        {
          language: 'ita',
          english_name: 'Italian',
          text: 'srt',
          is_draft: true,
        },
        { language: 'jpn', english_name: 'Japanese', text: null },
      ]);

      if (result.kind !== 'resolved') throw new Error('Expected resolved');
      expect(result.captions[0]).toEqual({
        kind: 'text',
        text: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
        format: 'srt',
        language: 'en',
        label: 'English',
        closedCaptions: false,
      });
      expect(result.captions[1]).toMatchObject({
        language: 'es',
        label: 'Español',
      });
      expect(result.captions.map((c) => c.language)).toEqual([
        'en',
        'es',
        'fr',
        'de',
        'zh',
        'pt',
        'haw',
      ]);
    });
  });
});
