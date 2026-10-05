import { createHttpClient, ProviderHttpError } from '../http.ts';
import type {
  CaptionSource,
  ListPage,
  ResolveResult,
  SourceItem,
  SourceProvider,
} from '../types.ts';
import { envCredentials } from './credentials.ts';

export interface CloudflareStreamCredentials {
  accountId: string;
  apiToken: string;
}

/** The recipe's `source` block for Cloudflare Stream. */
export interface CloudflareStreamSourceOptions {
  include_live_archives?: boolean;
}

interface Envelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: T;
}

interface CloudflareVideo {
  uid: string;
  meta?: { name?: string } | null;
  duration?: number;
  size?: number;
  created?: string;
  preview?: string;
  thumbnail?: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonText?: string };
  requireSignedURLs?: boolean;
  liveInput?: string;
}

interface CloudflareDownload {
  status?: 'ready' | 'inprogress' | 'error';
  url?: string;
  percentComplete?: number;
}

interface CloudflareCaption {
  language: string;
  label?: string;
  generated?: boolean;
  status?: 'ready' | 'inprogress' | 'error';
}

/** Position after the last listed video: its `created` time and every UID seen at that time. */
interface ListCursor {
  after: string;
  seen: string[];
}

const PAGE_SIZE = 1000;
const DOWNLOAD_POLL_MS = 30_000;
const SIGNED_URL_TTL_SECONDS = 12 * 60 * 60;

const FIRST_PAGE_WARNINGS = [
  {
    code: 'CLOUDFLARE_RENDITION_ONLY',
    message:
      'Cloudflare Stream does not retain original uploads. Each video migrates from its highest-quality MP4 download, not the original file.',
  },
  {
    code: 'CLOUDFLARE_DOWNLOADS_BILLED',
    message:
      'Generating MP4 downloads is billed by Cloudflare as delivered minutes for the duration of each video.',
    hint: 'Review Cloudflare Stream pricing before running the migration.',
  },
];

function skipReason(
  video: CloudflareVideo,
  source: CloudflareStreamSourceOptions,
): string | undefined {
  if (video.liveInput && !source.include_live_archives) {
    return 'Live archive (set source.include_live_archives to include)';
  }
  const state = video.status?.state;
  if (state === 'error') {
    return `Processing failed on Cloudflare Stream${video.status?.errorReasonText ? `: ${video.status.errorReasonText}` : ''}`;
  }
  if (state === 'live-inprogress') return 'Live broadcast in progress';
  if (state !== 'ready' || video.readyToStream === false) {
    return 'Still processing on Cloudflare Stream';
  }
  return undefined;
}

function embedPatterns(video: CloudflareVideo): string[] {
  const host = video.preview ? new URL(video.preview).host : undefined;
  return [
    host?.endsWith('.cloudflarestream.com')
      ? `${host}/${video.uid}`
      : `cloudflarestream.com/${video.uid}`,
    `iframe.videodelivery.net/${video.uid}`,
    `videodelivery.net/${video.uid}`,
  ];
}

function toSourceItem(
  video: CloudflareVideo,
  source: CloudflareStreamSourceOptions,
): SourceItem {
  const reason = skipReason(video, source);
  return {
    sourceId: video.uid,
    type: video.liveInput ? 'live_archive' : 'video',
    exportable: reason === undefined,
    skipReason: reason,
    title: video.meta?.name,
    durationSeconds:
      video.duration !== undefined && video.duration >= 0
        ? video.duration
        : undefined,
    sizeBytes: video.size,
    createdAt: video.created,
    sourceUrl: video.preview,
    embedPatterns: embedPatterns(video),
    posterUrl: video.thumbnail,
    captionCount: 0,
    expectedFidelity: 'rendition',
    raw: video,
  };
}

function normalizeLanguage(language: string): string {
  try {
    return Intl.getCanonicalLocales(language)[0] ?? language;
  } catch {
    return language;
  }
}

export function createCloudflareStreamProvider(options: {
  source?: CloudflareStreamSourceOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): SourceProvider<CloudflareStreamCredentials> {
  const source = options.source ?? {};
  const clients = new Map<string, ReturnType<typeof createHttpClient>>();
  const http = (creds: CloudflareStreamCredentials) => {
    const key = `${creds.accountId}:${creds.apiToken}`;
    let client = clients.get(key);
    if (!client) {
      client = createHttpClient({
        provider: 'cloudflare-stream',
        baseUrl: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(creds.accountId)}/stream`,
        headers: () => ({ Authorization: `Bearer ${creds.apiToken}` }),
        fetch: options.fetch,
        sleep: options.sleep,
        // Cloudflare allows 1,200 requests per five minutes per account and
        // blocks the account for five minutes when the limit is exceeded.
        rateLimit: { requests: 1000, perMs: 300_000 },
      });
      clients.set(key, client);
    }
    return client;
  };

  const spec = envCredentials('Cloudflare Stream', 'CLOUDFLARE_STREAM', [
    {
      key: 'accountId',
      name: 'CLOUDFLARE_ACCOUNT_ID',
      required: true,
      description:
        'The Cloudflare account ID, shown in the Cloudflare dashboard sidebar.',
    },
    {
      key: 'apiToken',
      name: 'CLOUDFLARE_API_TOKEN',
      required: true,
      description:
        'An API token with the Stream Write permission from https://dash.cloudflare.com/profile/api-tokens.',
    },
  ]);

  async function captions(
    client: ReturnType<typeof createHttpClient>,
    uid: string,
  ): Promise<CaptionSource[]> {
    const { result = [] } = await client.get<Envelope<CloudflareCaption[]>>(
      `/${uid}/captions`,
    );
    // Caption files are served only through the authenticated API, so the
    // text is downloaded here and hosted by the engine.
    return Promise.all(
      result
        .filter(
          (caption) =>
            caption.language && (caption.status ?? 'ready') === 'ready',
        )
        .map(async (caption) => {
          const response = await client.request(
            'GET',
            `/${uid}/captions/${encodeURIComponent(caption.language)}/vtt`,
          );
          return {
            kind: 'text' as const,
            text: await response.text(),
            format: 'vtt' as const,
            language: normalizeLanguage(caption.language),
            label: caption.label,
            closedCaptions: false,
          };
        }),
    );
  }

  return {
    id: 'cloudflare-stream',
    defaultConcurrency: 3,
    credentials: {
      variables: spec.variables,
      read: (env) => {
        const { accountId, apiToken } = spec.read(env);
        return {
          accountId: accountId as string,
          apiToken: apiToken as string,
        };
      },
    },

    async verify(creds) {
      try {
        await http(creds).get('', { query: { limit: 1 } });
        return { ok: true, warnings: [] };
      } catch (error) {
        if (error instanceof ProviderHttpError) {
          return {
            ok: false,
            warnings: [
              {
                ...error.toJSON(),
                hint: 'Check CLOUDFLARE_ACCOUNT_ID, and use an API token for that account with the Stream Write permission from https://dash.cloudflare.com/profile/api-tokens.',
              },
            ],
          };
        }
        throw error;
      }
    },

    async list(creds, cursor): Promise<ListPage> {
      const position = cursor ? (JSON.parse(cursor) as ListCursor) : undefined;
      const { result: videos } = await http(creds).get<
        Envelope<CloudflareVideo[]>
      >('', {
        query: { asc: true, limit: PAGE_SIZE, after: position?.after },
      });

      const seen = new Set(position?.seen);
      const items = videos
        .filter((video) => !seen.has(video.uid))
        .map((video) => toSourceItem(video, source));

      const last = videos.at(-1);
      let next: string | undefined;
      if (videos.length >= PAGE_SIZE && last?.created) {
        const sameTime = videos
          .filter((video) => video.created === last.created)
          .map((video) => video.uid);
        next = JSON.stringify({
          after: last.created,
          seen:
            last.created === position?.after
              ? [...seen, ...sameTime]
              : sameTime,
        } satisfies ListCursor);
      }

      return {
        items,
        next,
        ...(cursor === undefined && { warnings: FIRST_PAGE_WARNINGS }),
      };
    },

    async resolve(creds, item): Promise<ResolveResult> {
      const client = http(creds);
      const uid = item.sourceId;
      const path = `/${uid}/downloads`;

      let { result: downloads } =
        await client.get<Envelope<{ default?: CloudflareDownload }>>(path);
      if (!downloads?.default) {
        ({ result: downloads } =
          await client.post<Envelope<{ default?: CloudflareDownload }>>(path));
      }

      const download = downloads?.default;
      if (download?.status === 'error') {
        return {
          kind: 'unavailable',
          code: 'CLOUDFLARE_DOWNLOAD_FAILED',
          message: `Cloudflare Stream could not generate an MP4 download for video ${uid}.`,
        };
      }
      if (download?.status !== 'ready' || !download.url) {
        return { kind: 'pending', retryAfterMs: DOWNLOAD_POLL_MS };
      }

      let url = download.url;
      let expiresAt: Date | undefined;
      if ((item.raw as CloudflareVideo | undefined)?.requireSignedURLs) {
        const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
        const { result } = await client.post<Envelope<{ token?: string }>>(
          `/${uid}/token`,
          { downloadable: true, exp },
        );
        if (!result?.token) {
          return {
            kind: 'unavailable',
            code: 'CLOUDFLARE_SIGNED_URL_FAILED',
            message: `Cloudflare Stream did not return a signed token for video ${uid}.`,
          };
        }
        // A signed token replaces the video UID in the delivery URL.
        const signed = new URL(url);
        signed.pathname = signed.pathname.replace(
          `/${uid}/`,
          `/${result.token}/`,
        );
        url = signed.toString();
        expiresAt = new Date(exp * 1000);
      }

      return {
        kind: 'resolved',
        url,
        fidelity: 'rendition',
        ...(expiresAt && { expiresAt }),
        captions: await captions(client, uid),
      };
    },
  };
}
