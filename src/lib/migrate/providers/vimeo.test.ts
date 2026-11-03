import { describe, expect, test } from 'bun:test';
import { noSleep, routeFetch } from '../testing/route-fetch.ts';
import type { SourceItem } from '../types.ts';
import { createVimeoProvider, type VimeoSourceOptions } from './vimeo.ts';

const creds = { accessToken: 'vimeo-token' };

function video(id: string, overrides: Record<string, unknown> = {}) {
  return {
    uri: `/videos/${id}`,
    name: `Video ${id}`,
    description: 'A description',
    duration: 184,
    created_time: '2024-01-02T03:04:05+00:00',
    link: `https://vimeo.com/${id}`,
    type: 'video',
    privacy: { view: 'anybody' },
    status: 'available',
    upload: { status: 'complete' },
    transcode: { status: 'complete' },
    tags: [{ name: 'onboarding' }],
    parent_folder: { name: 'Marketing' },
    pictures: { base_link: `https://i.vimeocdn.com/video/${id}` },
    metadata: { connections: { texttracks: { total: 1 } } },
    ...overrides,
  };
}

function provider(
  routes: Parameters<typeof routeFetch>[0],
  source: VimeoSourceOptions = {},
) {
  const { fetch, requests } = routeFetch(routes);
  return {
    provider: createVimeoProvider({ source, fetch, sleep: noSleep }),
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

describe('vimeo provider', () => {
  test('reads the access token from VIMEO_ACCESS_TOKEN', () => {
    const { provider: p } = provider({});

    expect(p.credentials.read({ VIMEO_ACCESS_TOKEN: 'abc' })).toEqual({
      accessToken: 'abc',
    });
    expect(() => p.credentials.read({})).toThrow(
      expect.objectContaining({ code: 'VIMEO_CREDENTIALS_MISSING' }),
    );
  });

  describe('verify', () => {
    test('passes with the video_files scope', async () => {
      const { provider: p, requests } = provider({
        'GET /oauth/verify': () => ({ scope: 'public private video_files' }),
      });

      expect(await p.verify(creds)).toEqual({ ok: true, warnings: [] });
      expect(requests[0].headers.Authorization).toBe('Bearer vimeo-token');
      expect(requests[0].headers.Accept).toContain('version=3.4');
    });

    test('fails with VIMEO_SCOPE_MISSING without video_files', async () => {
      const { provider: p } = provider({
        'GET /oauth/verify': () => ({ scope: 'public private' }),
      });

      const result = await p.verify(creds);

      expect(result.ok).toBe(false);
      expect(result.warnings[0]).toMatchObject({
        code: 'VIMEO_SCOPE_MISSING',
        hint: expect.stringContaining('developer.vimeo.com'),
      });
    });

    test('fails with VIMEO_UNAUTHORIZED for a rejected token', async () => {
      const { provider: p } = provider({
        'GET /oauth/verify': () =>
          new Response('{"error":"Invalid token"}', { status: 401 }),
      });

      const result = await p.verify(creds);

      expect(result).toMatchObject({
        ok: false,
        warnings: [{ code: 'VIMEO_UNAUTHORIZED' }],
      });
    });
  });

  describe('list', () => {
    test('follows paging.next and maps each video', async () => {
      const { provider: p, requests } = provider({
        'GET /me/videos': (url) =>
          url.searchParams.get('page') === '2'
            ? { data: [video('2')], paging: { next: null } }
            : {
                data: [video('1')],
                paging: { next: '/me/videos?page=2&per_page=100' },
              },
      });

      const items = await listAll(p);

      expect(items.map((i) => i.sourceId)).toEqual(['1', '2']);
      expect(requests[0].url.searchParams.get('per_page')).toBe('100');
      expect(requests[0].url.searchParams.get('fields')).toContain('uri');
      expect(items[0]).toMatchObject({
        sourceId: '1',
        type: 'video',
        exportable: true,
        title: 'Video 1',
        description: 'A description',
        tags: ['onboarding'],
        folder: 'Marketing',
        durationSeconds: 184,
        createdAt: '2024-01-02T03:04:05+00:00',
        sourceUrl: 'https://vimeo.com/1',
        posterUrl: 'https://i.vimeocdn.com/video/1',
        captionCount: 1,
      });
      expect(items[0].embedPatterns).toEqual([
        'player.vimeo.com/video/1',
        'vimeo.com/1',
      ]);
    });

    test('marks videos that have not finished processing as not exportable', async () => {
      const { provider: p } = provider({
        'GET /me/videos': () => ({
          data: [
            video('ok'),
            video('uploading', { upload: { status: 'in_progress' } }),
            video('transcoding', { transcode: { status: 'in_progress' } }),
          ],
          paging: { next: null },
        }),
      });

      const items = await listAll(p);

      expect(items.map((i) => [i.sourceId, i.exportable])).toEqual([
        ['ok', true],
        ['uploading', false],
        ['transcoding', false],
      ]);
      expect(items[1].skipReason).toMatch(/processing/i);
    });

    test('skips stock videos, and live archives unless the recipe opts in', async () => {
      const routes = {
        'GET /me/videos': () => ({
          data: [
            video('stock', { type: 'stock' }),
            video('live', { type: 'live' }),
          ],
          paging: { next: null },
        }),
      };

      const defaults = await listAll(provider(routes).provider);
      const optedIn = await listAll(
        provider(routes, { include_live_archives: true }).provider,
      );

      expect(defaults.map((i) => i.exportable)).toEqual([false, false]);
      expect(defaults[1]).toMatchObject({ type: 'live_archive' });
      expect(optedIn.find((i) => i.sourceId === 'live')?.exportable).toBe(true);
    });

    test('filters by folder and privacy from the recipe', async () => {
      const routes = {
        'GET /me/videos': () => ({
          data: [
            video('a'),
            video('b', { parent_folder: { name: 'Internal' } }),
            video('c', { privacy: { view: 'nobody' } }),
          ],
          paging: { next: null },
        }),
      };

      const items = await listAll(
        provider(routes, { folders: ['Marketing'], include_private: false })
          .provider,
      );

      expect(items.filter((i) => i.exportable).map((i) => i.sourceId)).toEqual([
        'a',
      ]);
    });
  });

  describe('resolve', () => {
    const item = {
      sourceId: '1',
      type: 'video',
      exportable: true,
      embedPatterns: [],
      captionCount: 1,
      raw: {},
    } as SourceItem;

    function resolveWith(download: unknown[], texttracks: unknown[] = []) {
      return provider({
        'GET /videos/1': () => ({ download }),
        'GET /videos/1/texttracks': () => ({ data: texttracks }),
      }).provider.resolve(creds, item);
    }

    test('prefers the source file and reports original fidelity', async () => {
      const result = await resolveWith([
        {
          quality: 'hd',
          size: 900,
          link: 'https://vimeo.test/hd.mp4',
          expires: '2026-10-06T12:00:00+00:00',
        },
        {
          quality: 'source',
          rendition: 'source',
          size: 500,
          link: 'https://vimeo.test/source.mp4',
          expires: '2026-10-06T12:00:00+00:00',
        },
      ]);

      expect(result).toMatchObject({
        kind: 'resolved',
        url: 'https://vimeo.test/source.mp4',
        fidelity: 'original',
        expiresAt: new Date('2026-10-06T12:00:00+00:00'),
      });
    });

    test('falls back to the largest rendition', async () => {
      const result = await resolveWith([
        { quality: 'sd', size: 100, link: 'https://vimeo.test/sd.mp4' },
        { quality: 'hd', size: 900, link: 'https://vimeo.test/hd.mp4' },
      ]);

      expect(result).toMatchObject({
        url: 'https://vimeo.test/hd.mp4',
        fidelity: 'rendition',
      });
    });

    test('is unavailable with VIMEO_PLAN_NO_DOWNLOADS when there are no downloads', async () => {
      expect(await resolveWith([])).toMatchObject({
        kind: 'unavailable',
        code: 'VIMEO_PLAN_NO_DOWNLOADS',
      });
    });

    test('includes caption and subtitle tracks, with closed captions marked', async () => {
      const result = await resolveWith(
        [{ quality: 'source', size: 1, link: 'https://vimeo.test/source.mp4' }],
        [
          {
            type: 'captions',
            language: 'en-US',
            link: 'https://vimeo.test/en.vtt',
            name: 'English CC',
          },
          {
            type: 'subtitles',
            language: 'es',
            link: 'https://vimeo.test/es.vtt',
            name: 'Español',
          },
          {
            type: 'chapters',
            language: 'en',
            link: 'https://vimeo.test/chapters.vtt',
          },
        ],
      );

      expect(result).toMatchObject({
        captions: [
          {
            kind: 'url',
            url: 'https://vimeo.test/en.vtt',
            language: 'en-US',
            label: 'English CC',
            closedCaptions: true,
          },
          {
            kind: 'url',
            url: 'https://vimeo.test/es.vtt',
            language: 'es',
            label: 'Español',
            closedCaptions: false,
          },
        ],
      });
    });
  });
});
