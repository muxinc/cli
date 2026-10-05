import { createHmac } from 'node:crypto';
import { createHttpClient, ProviderHttpError } from '../http.ts';
import type {
  CaptionSource,
  ResolveResult,
  SourceItem,
  SourceProvider,
} from '../types.ts';
import { envCredentials } from './credentials.ts';

export interface BunnyCredentials {
  libraryId: string;
  apiKey: string;
  /** Pull zone token authentication key, set only when CDN token authentication is on. */
  cdnTokenKey?: string;
}

/** The recipe's `source` block for Bunny Stream. */
export interface BunnySourceOptions {
  collection?: string;
}

interface BunnyVideo {
  guid: string;
  title?: string;
  description?: string | null;
  dateUploaded?: string;
  length?: number;
  status?: number;
  storageSize?: number;
  thumbnailFileName?: string | null;
  hasOriginal?: boolean | null;
  hasMP4Fallback?: boolean;
  availableResolutions?: string | null;
  chapters?: Array<{ title: string; start: number; end: number }> | null;
  captions?: Array<{ srclang?: string; label?: string }> | null;
}

interface BunnyVideoPage {
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  items: BunnyVideo[];
}

interface BunnyPlayData {
  video?: BunnyVideo;
  captionsPath?: string | null;
  thumbnailUrl?: string | null;
  fallbackUrl?: string | null;
  videoPlaylistUrl?: string | null;
  originalUrl?: string | null;
  enableMP4Fallback?: boolean;
}

const FINISHED = 4;
const PAGE_SIZE = 100;
/** Bunny generates MP4 fallbacks up to 1080p. */
const MAX_MP4_HEIGHT = 1080;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

function skipReason(status: number | undefined): string | undefined {
  switch (status) {
    case FINISHED:
      return undefined;
    case 0:
      return 'The video has not been uploaded to Bunny Stream';
    case 1:
    case 2:
    case 3:
    case 7:
    case 8:
      return 'Still processing on Bunny Stream';
    case 5:
      return 'Encoding failed on Bunny Stream';
    case 6:
      return 'Upload failed on Bunny Stream';
    default:
      return `Bunny Stream reports status ${status}, which cannot be exported`;
  }
}

/** Bunny returns UTC timestamps without an offset. */
function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}

function bcp47(language: string): string {
  try {
    return Intl.getCanonicalLocales(language.replaceAll('_', '-'))[0];
  } catch {
    return language;
  }
}

function cdnHost(play: BunnyPlayData): string | undefined {
  for (const url of [
    play.originalUrl,
    play.fallbackUrl,
    play.videoPlaylistUrl,
    play.thumbnailUrl,
    play.captionsPath,
  ]) {
    if (!url) continue;
    try {
      return new URL(url).host;
    } catch {}
  }
  return undefined;
}

/** The highest MP4 fallback height, which never exceeds 1080p unless it is the only resolution. */
function mp4Height(resolutions: string | null | undefined): number | undefined {
  const heights = (resolutions ?? '')
    .split(',')
    .map((label) => Number.parseInt(label, 10))
    .filter((height) => Number.isFinite(height) && height > 0);
  if (heights.length === 1) return heights[0];
  const eligible = heights.filter((height) => height <= MAX_MP4_HEIGHT);
  return eligible.length > 0 ? Math.max(...eligible) : undefined;
}

/**
 * Signs a CDN URL with Bunny's advanced token authentication:
 * `HS256-` + Base64URL(HMAC-SHA256(key, path + expires + signing_data)).
 */
function signUrl(url: string, key: string, expires: number): string {
  const target = new URL(url);
  const params = [...target.searchParams]
    .filter(([name]) => name !== 'token' && name !== 'expires')
    .sort(([a], [b]) => a.localeCompare(b));
  const signingData = params.map(([k, v]) => `${k}=${v}`).join('&');
  const token = `HS256-${createHmac('sha256', key)
    .update(`${target.pathname}${expires}${signingData}`)
    .digest('base64url')}`;
  const extra = params
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('');
  return `${target.origin}${target.pathname}?token=${token}${extra}&expires=${expires}`;
}

export function createBunnyProvider(options: {
  source?: BunnySourceOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): SourceProvider<BunnyCredentials> {
  const source = options.source ?? {};
  const now = options.now ?? Date.now;
  const clients = new Map<string, ReturnType<typeof createHttpClient>>();
  const hosts = new Map<string, Promise<string | undefined>>();

  const http = (creds: BunnyCredentials) => {
    const cacheKey = `${creds.libraryId}:${creds.apiKey}`;
    let client = clients.get(cacheKey);
    if (!client) {
      client = createHttpClient({
        provider: 'bunny',
        baseUrl: `https://video.bunnycdn.com/library/${encodeURIComponent(creds.libraryId)}`,
        headers: () => ({
          AccessKey: creds.apiKey,
          Accept: 'application/json',
        }),
        fetch: options.fetch,
        sleep: options.sleep,
        now: options.now,
      });
      clients.set(cacheKey, client);
    }
    return client;
  };

  // CDN requests never carry the API key.
  const cdn = createHttpClient({
    provider: 'bunny',
    baseUrl: 'https://video.bunnycdn.com',
    headers: () => ({}),
    fetch: options.fetch,
    sleep: options.sleep,
    now: options.now,
    maxRetries: 2,
  });

  const playData = (creds: BunnyCredentials, guid: string) =>
    http(creds).get<BunnyPlayData>(`/videos/${encodeURIComponent(guid)}/play`);

  const expiry = () => Math.floor(now() / 1000) + TOKEN_TTL_SECONDS;
  const sign = (creds: BunnyCredentials, url: string, expires: number) =>
    creds.cdnTokenKey ? signUrl(url, creds.cdnTokenKey, expires) : url;

  /** The library's CDN hostname, learned once from a video's play data. */
  function libraryHost(
    creds: BunnyCredentials,
    videos: BunnyVideo[],
  ): Promise<string | undefined> {
    const known = hosts.get(creds.libraryId);
    if (known) return known;
    const sample =
      videos.find((video) => video.status === FINISHED) ?? videos[0];
    if (!sample) return Promise.resolve(undefined);
    const lookup = playData(creds, sample.guid).then(cdnHost, (error) => {
      if (error instanceof ProviderHttpError) return undefined;
      throw error;
    });
    hosts.set(creds.libraryId, lookup);
    // A failed lookup is retried on the next page rather than cached.
    lookup.then(
      (host) => host ?? hosts.delete(creds.libraryId),
      () => hosts.delete(creds.libraryId),
    );
    return lookup;
  }

  function toSourceItem(
    video: BunnyVideo,
    creds: BunnyCredentials,
    host: string | undefined,
  ): SourceItem {
    const { libraryId } = creds;
    const { guid } = video;
    const reason = skipReason(video.status);
    const languages = (video.captions ?? [])
      .map((caption) => caption.srclang)
      .filter((lang): lang is string => Boolean(lang))
      .map(bcp47);
    return {
      sourceId: guid,
      type: 'video',
      exportable: reason === undefined,
      skipReason: reason,
      title: video.title,
      description: video.description ?? undefined,
      durationSeconds: video.length,
      sizeBytes: video.storageSize,
      createdAt: isoDate(video.dateUploaded),
      sourceUrl: `https://player.mediadelivery.net/play/${libraryId}/${guid}`,
      embedPatterns: [
        `player.mediadelivery.net/embed/${libraryId}/${guid}`,
        `player.mediadelivery.net/play/${libraryId}/${guid}`,
        `iframe.mediadelivery.net/embed/${libraryId}/${guid}`,
        `iframe.mediadelivery.net/play/${libraryId}/${guid}`,
        `video.bunnycdn.com/play/${libraryId}/${guid}`,
        ...(host ? [`${host}/${guid}`] : []),
      ],
      // Stored unsigned: the state file keeps no URLs derived from the token key.
      posterUrl:
        host && video.thumbnailFileName
          ? `https://${host}/${guid}/${video.thumbnailFileName}`
          : undefined,
      chapters: video.chapters?.map((chapter) => ({
        title: chapter.title,
        startSeconds: chapter.start,
      })),
      captionCount: video.captions?.length ?? 0,
      captionLanguages: languages,
      expectedFidelity: video.hasOriginal ? 'original' : 'rendition',
      raw: video,
    };
  }

  async function resolve(
    creds: BunnyCredentials,
    item: SourceItem,
  ): Promise<ResolveResult> {
    const guid = item.sourceId;
    const play = await playData(creds, guid);
    const video = play.video ?? (item.raw as BunnyVideo);
    const host = cdnHost(play);

    let url: string | undefined;
    let fidelity: 'original' | 'rendition' = 'rendition';
    if (video.hasOriginal) {
      url = play.originalUrl || (host && `https://${host}/${guid}/original`);
      fidelity = 'original';
    }
    if (!url) {
      const height = mp4Height(video.availableResolutions);
      const mp4 = video.hasMP4Fallback ?? play.enableMP4Fallback;
      if (mp4 && host && height) {
        url = `https://${host}/${guid}/play_${height}p.mp4`;
        fidelity = 'rendition';
      }
    }
    if (!url) {
      return {
        kind: 'unavailable',
        code: 'BUNNY_NO_ORIGINAL_OR_MP4',
        message: `Bunny Stream has neither the original file nor an MP4 fallback for video ${guid}. Enable "Keep original files" or MP4 fallback in the library encoding settings and re-encode the video.`,
      };
    }

    const expires = expiry();
    const captions: CaptionSource[] = host
      ? (video.captions ?? [])
          .filter((caption) => caption.srclang)
          .map((caption) => ({
            kind: 'url',
            url: sign(
              creds,
              `https://${host}/${guid}/captions/${caption.srclang}.vtt`,
              expires,
            ),
            language: bcp47(caption.srclang as string),
            label: caption.label,
            closedCaptions: false,
          }))
      : [];

    return {
      kind: 'resolved',
      url: sign(creds, url, expires),
      fidelity,
      ...(creds.cdnTokenKey && { expiresAt: new Date(expires * 1000) }),
      captions,
    };
  }

  const spec = envCredentials('Bunny Stream', 'BUNNY', [
    {
      key: 'libraryId',
      name: 'BUNNY_STREAM_LIBRARY_ID',
      required: true,
      description:
        'The video library ID, shown under Stream > your library > API in the Bunny dashboard.',
    },
    {
      key: 'apiKey',
      name: 'BUNNY_STREAM_API_KEY',
      required: true,
      description:
        'The video library API key, shown under Stream > your library > API in the Bunny dashboard.',
    },
    {
      key: 'cdnTokenKey',
      name: 'BUNNY_CDN_TOKEN_KEY',
      required: false,
      description:
        "The pull zone token authentication key. Required only when CDN token authentication is enabled on the library's pull zone.",
    },
  ]);

  return {
    id: 'bunny',
    defaultConcurrency: 4,
    credentials: {
      variables: spec.variables,
      read(env) {
        const values = spec.read(env);
        return {
          libraryId: values.libraryId as string,
          apiKey: values.apiKey as string,
          cdnTokenKey: values.cdnTokenKey,
        };
      },
    },

    async verify(creds) {
      let videos: BunnyVideo[];
      try {
        ({ items: videos } = await http(creds).get<BunnyVideoPage>('/videos', {
          query: { page: 1, itemsPerPage: 10 },
        }));
      } catch (error) {
        if (error instanceof ProviderHttpError) {
          return {
            ok: false,
            warnings: [
              {
                ...error.toJSON(),
                hint: 'Check BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY. Both are shown under Stream > your library > API in the Bunny dashboard.',
              },
            ],
          };
        }
        throw error;
      }

      const sample = videos.find((video) => video.status === FINISHED);
      if (!sample) return { ok: true, warnings: [] };

      let resolved: ResolveResult;
      try {
        resolved = await resolve(creds, toSourceItem(sample, creds, undefined));
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;
        return { ok: true, warnings: [error.toJSON()] };
      }
      if (resolved.kind !== 'resolved') return { ok: true, warnings: [] };

      try {
        await cdn.request('HEAD', resolved.url);
        return { ok: true, warnings: [] };
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;
        if (error.status === 403) {
          return {
            ok: false,
            warnings: [
              {
                code: 'BUNNY_DIRECT_ACCESS_BLOCKED',
                message: `The Bunny CDN refused direct access to video ${sample.guid} (HTTP 403), so Mux would be unable to download it.`,
                hint: 'In the library security settings, turn off "Block direct URL file access" and remove allowed-domain restrictions, or set BUNNY_CDN_TOKEN_KEY if CDN token authentication is enabled.',
              },
            ],
          };
        }
        return { ok: true, warnings: [error.toJSON()] };
      }
    },

    async list(creds, cursor) {
      const pageNumber = cursor ? Number(cursor) : 1;
      const page = await http(creds).get<BunnyVideoPage>('/videos', {
        query: {
          page: pageNumber,
          itemsPerPage: PAGE_SIZE,
          collection: source.collection,
        },
      });
      const items = page.items ?? [];
      const host = await libraryHost(creds, items);
      const current = page.currentPage ?? pageNumber;
      const perPage = page.itemsPerPage ?? PAGE_SIZE;
      const more = items.length > 0 && current * perPage < page.totalItems;
      return {
        items: items.map((video) => toSourceItem(video, creds, host)),
        next: more ? String(current + 1) : undefined,
      };
    },

    resolve,
  };
}
