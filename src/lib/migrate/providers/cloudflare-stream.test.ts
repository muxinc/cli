import { describe, expect, test } from 'bun:test';
import { noSleep, routeFetch } from '../testing/route-fetch.ts';
import type { SourceItem } from '../types.ts';
import {
  type CloudflareStreamSourceOptions,
  createCloudflareStreamProvider,
} from './cloudflare-stream.ts';

const creds = { accountId: 'acct', apiToken: 'cf-token' };
const base = '/client/v4/accounts/acct/stream';

function envelope(result: unknown, extra: Record<string, unknown> = {}) {
  return { success: true, errors: [], messages: [], result, ...extra };
}

function video(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    meta: { name: `Video ${uid}` },
    duration: 184.5,
    size: 1024,
    created: `2024-01-0${uid.length}T03:04:05.000000Z`,
    preview: `https://customer-abc123.cloudflarestream.com/${uid}/watch`,
    thumbnail: `https://customer-abc123.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
    readyToStream: true,
    status: { state: 'ready' },
    requireSignedURLs: false,
    liveInput: '',
    ...overrides,
  };
}

function provider(
  routes: Parameters<typeof routeFetch>[0],
  source: CloudflareStreamSourceOptions = {},
) {
  const { fetch, requests } = routeFetch(routes);
  return {
    provider: createCloudflareStreamProvider({ source, fetch, sleep: noSleep }),
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

describe('cloudflare stream provider', () => {
  test('reads the account ID and API token from the environment', () => {
    const { provider: p } = provider({});

    expect(
      p.credentials.read({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
      }),
    ).toEqual({ accountId: 'acct', apiToken: 'tok' });
    expect(() => p.credentials.read({ CLOUDFLARE_ACCOUNT_ID: 'acct' })).toThrow(
      expect.objectContaining({
        code: 'CLOUDFLARE_STREAM_CREDENTIALS_MISSING',
        message: expect.stringContaining('CLOUDFLARE_API_TOKEN'),
      }),
    );
  });

  describe('verify', () => {
    test('passes when the token can list Stream videos', async () => {
      const { provider: p, requests } = provider({
        [`GET ${base}`]: () => envelope([video('1')]),
      });

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests[0].headers.Authorization).toBe('Bearer cf-token');
      expect(requests[0].url.host).toBe('api.cloudflare.com');
      expect(requests[0].url.searchParams.get('limit')).toBe('1');
    });

    test('fails with a hint when the token is rejected', async () => {
      const { provider: p } = provider({
        [`GET ${base}`]: () =>
          new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 10000, message: 'Authentication error' }],
              messages: [],
              result: null,
            }),
            { status: 403 },
          ),
      });

      const result = await p.verify(creds);

      expect(result.ok).toBe(false);
      expect(result.warnings[0]).toMatchObject({
        code: 'CLOUDFLARE_STREAM_FORBIDDEN',
        message: expect.stringContaining('Authentication error'),
        hint: expect.stringContaining('Stream Write'),
      });
    });
  });

  describe('list', () => {
    test('pages by created date and maps each video', async () => {
      const first = Array.from({ length: 1000 }, (_, i) =>
        video(`a${i}`, { created: '2024-01-01T00:00:00.000000Z' }),
      );
      first[999] = video('last', { created: '2024-01-02T00:00:00.000000Z' });
      const { provider: p, requests } = provider({
        [`GET ${base}`]: (url) =>
          url.searchParams.get('after')
            ? envelope([
                video('last', { created: '2024-01-02T00:00:00.000000Z' }),
                video('next', { created: '2024-01-03T00:00:00.000000Z' }),
              ])
            : envelope(first),
      });

      const items = await listAll(p);

      expect(items).toHaveLength(1001);
      expect(items.at(-1)?.sourceId).toBe('next');
      expect(items.filter((i) => i.sourceId === 'last')).toHaveLength(1);
      expect(requests).toHaveLength(2);
      expect(requests[0].url.searchParams.get('limit')).toBe('1000');
      expect(requests[0].url.searchParams.get('asc')).toBe('true');
      expect(requests[1].url.searchParams.get('after')).toBe(
        '2024-01-02T00:00:00.000000Z',
      );
    });

    test('maps fields and expects rendition fidelity', async () => {
      const { provider: p } = provider({
        [`GET ${base}`]: () => envelope([video('1')]),
      });

      const [item] = await listAll(p);

      expect(item).toMatchObject({
        sourceId: '1',
        type: 'video',
        exportable: true,
        title: 'Video 1',
        durationSeconds: 184.5,
        sizeBytes: 1024,
        createdAt: '2024-01-01T03:04:05.000000Z',
        sourceUrl: 'https://customer-abc123.cloudflarestream.com/1/watch',
        posterUrl:
          'https://customer-abc123.cloudflarestream.com/1/thumbnails/thumbnail.jpg',
        captionCount: 0,
        expectedFidelity: 'rendition',
      });
      expect(item.embedPatterns).toEqual([
        'customer-abc123.cloudflarestream.com/1',
        'iframe.videodelivery.net/1',
        'videodelivery.net/1',
      ]);
    });

    test('warns about rendition fidelity and download billing on the first page only', async () => {
      const full = Array.from({ length: 1000 }, (_, i) =>
        video(`v${i}`, { created: `2024-01-01T00:00:00.${i}Z` }),
      );
      const { provider: p } = provider({
        [`GET ${base}`]: (url) =>
          url.searchParams.get('after') ? envelope([]) : envelope(full),
      });

      const first = await p.list(creds);
      const second = await p.list(creds, first.next);

      expect(first.warnings?.map((w) => w.code)).toEqual([
        'CLOUDFLARE_RENDITION_ONLY',
        'CLOUDFLARE_DOWNLOADS_BILLED',
      ]);
      expect(first.warnings?.[1].message).toMatch(/delivered minutes/i);
      expect(second.warnings ?? []).toEqual([]);
      expect(second.next).toBeUndefined();
    });

    test('marks videos that are not ready as not exportable', async () => {
      const { provider: p } = provider({
        [`GET ${base}`]: () =>
          envelope([
            video('ok'),
            video('queued', {
              readyToStream: false,
              status: { state: 'queued' },
            }),
            video('failed', {
              readyToStream: false,
              status: { state: 'error' },
            }),
          ]),
      });

      const items = await listAll(p);

      expect(items.map((i) => [i.sourceId, i.exportable])).toEqual([
        ['ok', true],
        ['queued', false],
        ['failed', false],
      ]);
      expect(items[1].skipReason).toMatch(/processing/i);
      expect(items[2].skipReason).toMatch(/failed/i);
    });

    test('treats live recordings as live archives, exportable only when the recipe opts in', async () => {
      const routes = {
        [`GET ${base}`]: () =>
          envelope([video('rec', { liveInput: 'input-1' })]),
      };

      const [defaults] = await listAll(provider(routes).provider);
      const [optedIn] = await listAll(
        provider(routes, { include_live_archives: true }).provider,
      );

      expect(defaults).toMatchObject({
        type: 'live_archive',
        exportable: false,
        skipReason: expect.stringContaining('include_live_archives'),
      });
      expect(optedIn).toMatchObject({ type: 'live_archive', exportable: true });
    });
  });

  describe('resolve', () => {
    const downloadUrl = (uid: string) =>
      `https://customer-abc123.cloudflarestream.com/${uid}/downloads/default.mp4`;

    function item(raw: Record<string, unknown> = video('1')): SourceItem {
      return {
        sourceId: '1',
        type: 'video',
        exportable: true,
        embedPatterns: [],
        captionCount: 0,
        raw,
      };
    }

    function routes(
      downloads: () => unknown,
      extra: Parameters<typeof routeFetch>[0] = {},
    ) {
      return {
        [`GET ${base}/1/downloads`]: downloads,
        [`GET ${base}/1/captions`]: () => envelope([]),
        ...extra,
      };
    }

    test('creates the default download and reports pending', async () => {
      const { provider: p, requests } = provider(
        routes(() => envelope({}), {
          [`POST ${base}/1/downloads`]: () =>
            envelope({
              default: {
                status: 'inprogress',
                url: downloadUrl('1'),
                percentComplete: 0,
              },
            }),
        }),
      );

      const result = await p.resolve(creds, item());

      expect(result).toEqual({ kind: 'pending', retryAfterMs: 30_000 });
      expect(requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
        `GET ${base}/1/downloads`,
        `POST ${base}/1/downloads`,
      ]);
      expect(requests[1].headers.Authorization).toBe('Bearer cf-token');
    });

    test('polls an existing download without creating another', async () => {
      let status = 'inprogress';
      const { provider: p, requests } = provider(
        routes(() =>
          envelope({
            default: { status, url: downloadUrl('1'), percentComplete: 50 },
          }),
        ),
      );

      const pending = await p.resolve(creds, item());
      status = 'ready';
      const ready = await p.resolve(creds, item());

      expect(pending.kind).toBe('pending');
      expect(ready).toEqual({
        kind: 'resolved',
        url: downloadUrl('1'),
        fidelity: 'rendition',
        captions: [],
      });
      expect(requests.some((r) => r.method === 'POST')).toBe(false);
    });

    test('is unavailable when Cloudflare fails to generate the download', async () => {
      const { provider: p } = provider(
        routes(() =>
          envelope({ default: { status: 'error', percentComplete: 0 } }),
        ),
      );

      expect(await p.resolve(creds, item())).toMatchObject({
        kind: 'unavailable',
        code: 'CLOUDFLARE_DOWNLOAD_FAILED',
      });
    });

    test('signs the download URL for videos that require signed URLs', async () => {
      const { provider: p, requests } = provider(
        routes(
          () =>
            envelope({
              default: { status: 'ready', url: downloadUrl('1') },
            }),
          {
            [`POST ${base}/1/token`]: () => envelope({ token: 'signed.jwt' }),
          },
        ),
      );

      const before = Date.now();
      const result = await p.resolve(
        creds,
        item(video('1', { requireSignedURLs: true })),
      );

      expect(result).toMatchObject({
        kind: 'resolved',
        url: 'https://customer-abc123.cloudflarestream.com/signed.jwt/downloads/default.mp4',
        fidelity: 'rendition',
      });
      const body = JSON.parse(
        requests.find((r) => r.url.pathname.endsWith('/token'))?.body ?? '{}',
      );
      expect(body.downloadable).toBe(true);
      expect(body.exp * 1000).toBeGreaterThan(before);
      if (result.kind !== 'resolved') throw new Error('expected resolved');
      expect(result.expiresAt?.getTime()).toBe(body.exp * 1000);
    });

    test('downloads ready captions as VTT text with normalized languages', async () => {
      const { provider: p, requests } = provider(
        routes(
          () =>
            envelope({ default: { status: 'ready', url: downloadUrl('1') } }),
          {
            [`GET ${base}/1/captions`]: () =>
              envelope([
                {
                  language: 'en-us',
                  label: 'English',
                  generated: false,
                  status: 'ready',
                },
                {
                  language: 'de',
                  label: 'Deutsch',
                  generated: true,
                  status: 'inprogress',
                },
              ]),
            [`GET ${base}/1/captions/en-us/vtt`]: () =>
              new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello', {
                headers: { 'content-type': 'text/vtt' },
              }),
          },
        ),
      );

      const result = await p.resolve(creds, item());

      expect(result).toMatchObject({
        kind: 'resolved',
        captions: [
          {
            kind: 'text',
            text: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello',
            format: 'vtt',
            language: 'en-US',
            label: 'English',
            closedCaptions: false,
          },
        ],
      });
      expect(
        requests.find((r) => r.url.pathname.endsWith('/vtt'))?.headers
          .Authorization,
      ).toBe('Bearer cf-token');
    });
  });
});
