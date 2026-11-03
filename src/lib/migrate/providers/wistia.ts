import { createHttpClient, ProviderHttpError } from '../http.ts';
import type {
  CaptionSource,
  ResolveResult,
  SourceItem,
  SourceProvider,
} from '../types.ts';
import { envCredentials } from './credentials.ts';

export interface WistiaCredentials {
  apiToken: string;
}

/** The recipe's `source` block for Wistia. */
export interface WistiaSourceOptions {
  /** Folder (formerly project) names or hashed IDs to include. */
  folders?: string[];
}

/** The pinned Data API release, sent as `X-Wistia-API-Version`. */
export const WISTIA_API_VERSION = '2026-09';

const PER_PAGE = 100;

interface WistiaAsset {
  url?: string;
  width?: number | null;
  height?: number | null;
  file_size?: number | null;
  content_type?: string | null;
  type?: string;
}

interface WistiaMedia {
  hashed_id: string;
  name?: string;
  description?: string;
  duration?: number | null;
  created?: string;
  status?: 'queued' | 'processing' | 'ready' | 'failed';
  thumbnail?: { url?: string } | null;
  folder?: { name?: string; hashed_id?: string } | null;
  tags?: Array<{ name?: string }>;
  assets?: WistiaAsset[] | null;
}

interface WistiaCaption {
  language?: string;
  english_name?: string;
  native_name?: string;
  text?: string | null;
  is_draft?: boolean;
}

/** ISO 639-2 codes Wistia uses, mapped to their BCP 47 equivalents. */
const LANGUAGES: Record<string, string> = {
  ara: 'ar',
  chi: 'zh',
  dut: 'nl',
  deu: 'de',
  eng: 'en',
  fra: 'fr',
  fre: 'fr',
  ger: 'de',
  hin: 'hi',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  nld: 'nl',
  pol: 'pl',
  por: 'pt',
  rus: 'ru',
  spa: 'es',
  swe: 'sv',
  tur: 'tr',
  zho: 'zh',
};

const MP4_RENDITION = /^(?:Hd|Md)?Mp4VideoFile$|^IPhoneVideoFile$/i;

/** Two-letter codes pass through; unmapped three-letter codes are valid BCP 47. */
function toBcp47(code: string): string {
  const lower = code.trim().toLowerCase();
  return LANGUAGES[lower] ?? lower;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/** Wistia descriptions are HTML; the asset gets plain text. */
function plainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name) => ENTITIES[name])
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

function originalFile(assets: WistiaMedia['assets']): WistiaAsset | undefined {
  return (assets ?? []).find(
    (asset) => asset.type === 'OriginalFile' && asset.url,
  );
}

/** The largest streaming mp4, by resolution and then file size. */
function largestRendition(
  assets: WistiaMedia['assets'],
): WistiaAsset | undefined {
  const area = (a: WistiaAsset) => (a.width ?? 0) * (a.height ?? 0);
  return (assets ?? [])
    .filter((asset) => asset.url && MP4_RENDITION.test(asset.type ?? ''))
    .sort(
      (a, b) => area(b) - area(a) || (b.file_size ?? 0) - (a.file_size ?? 0),
    )[0];
}

function skipReason(
  media: WistiaMedia,
  source: WistiaSourceOptions,
): string | undefined {
  if (media.status === 'failed') return 'Processing failed on Wistia';
  if (media.status !== 'ready') return 'Still processing on Wistia';
  const folder = media.folder;
  if (
    source.folders?.length &&
    !source.folders.some(
      (selected) => selected === folder?.name || selected === folder?.hashed_id,
    )
  ) {
    return 'Not in a selected folder';
  }
  return undefined;
}

function toSourceItem(
  media: WistiaMedia,
  source: WistiaSourceOptions,
): SourceItem {
  const id = media.hashed_id;
  const reason = skipReason(media, source);
  const original = originalFile(media.assets);
  return {
    sourceId: id,
    type: 'video',
    exportable: reason === undefined,
    skipReason: reason,
    title: media.name,
    description: plainText(media.description),
    tags: media.tags?.flatMap((tag) => (tag.name ? [tag.name] : [])),
    folder: media.folder?.name,
    durationSeconds: media.duration ?? undefined,
    sizeBytes: original?.file_size ?? undefined,
    createdAt: media.created,
    embedPatterns: [
      `fast.wistia.net/embed/iframe/${id}`,
      `fast.wistia.com/embed/medias/${id}`,
      `wistia.com/medias/${id}`,
      `wistia_async_${id}`,
      `wi.st/medias/${id}`,
    ],
    posterUrl: media.thumbnail?.url,
    captionCount: 0,
    ...(original && { expectedFidelity: 'original' as const }),
    raw: media,
  };
}

export function createWistiaProvider(options: {
  source?: WistiaSourceOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): SourceProvider<WistiaCredentials> {
  const source = options.source ?? {};
  const clients = new Map<string, ReturnType<typeof createHttpClient>>();
  const http = (creds: WistiaCredentials) => {
    let client = clients.get(creds.apiToken);
    if (!client) {
      client = createHttpClient({
        provider: 'wistia',
        baseUrl: 'https://api.wistia.com/modern',
        headers: () => ({
          Authorization: `Bearer ${creds.apiToken}`,
          'X-Wistia-API-Version': WISTIA_API_VERSION,
        }),
        rateLimit: { requests: 600, perMs: 60_000 },
        fetch: options.fetch,
        sleep: options.sleep,
      });
      clients.set(creds.apiToken, client);
    }
    return client;
  };

  const spec = envCredentials('Wistia', 'WISTIA', [
    {
      key: 'apiToken',
      name: 'WISTIA_API_TOKEN',
      required: true,
      description:
        'An API token with the "Read all folder and media data" permission, from Account Settings > API Access in Wistia.',
    },
  ]);

  return {
    id: 'wistia',
    defaultConcurrency: 4,
    credentials: {
      variables: spec.variables,
      read: (env) => ({ apiToken: spec.read(env).apiToken as string }),
    },

    async verify(creds) {
      try {
        await http(creds).get('/medias', {
          query: { type: 'Video', per_page: 1 },
        });
        return { ok: true, warnings: [] };
      } catch (error) {
        if (error instanceof ProviderHttpError) {
          return {
            ok: false,
            warnings: [
              {
                ...error.toJSON(),
                hint: 'Create an API token with the "Read all folder and media data" permission in Wistia under Account Settings > API Access, and set it as WISTIA_API_TOKEN.',
              },
            ],
          };
        }
        throw error;
      }
    },

    async list(creds, cursor) {
      const page = Number(cursor ?? 1);
      const medias = await http(creds).get<WistiaMedia[]>('/medias', {
        query: { type: 'Video', per_page: PER_PAGE, page },
      });
      return {
        items: medias.map((media) => toSourceItem(media, source)),
        next: medias.length < PER_PAGE ? undefined : String(page + 1),
      };
    },

    async resolve(creds, item): Promise<ResolveResult> {
      const client = http(creds);
      const id = encodeURIComponent(item.sourceId);
      const [media, tracks] = await Promise.all([
        client.get<WistiaMedia>(`/medias/${id}`),
        client.get<WistiaCaption[] | null>(`/medias/${id}/captions`),
      ]);

      const original = originalFile(media?.assets);
      const file = original ?? largestRendition(media?.assets);
      if (!file?.url) {
        return {
          kind: 'unavailable',
          code: 'WISTIA_NO_DOWNLOADABLE_ASSET',
          message: `Wistia returned no downloadable video file for media ${item.sourceId}.`,
        };
      }

      const captions: CaptionSource[] = (tracks ?? [])
        .filter((track) => track.text && track.language && !track.is_draft)
        .map((track) => ({
          kind: 'text',
          text: track.text as string,
          format: 'srt',
          language: toBcp47(track.language as string),
          label: track.native_name ?? track.english_name,
          closedCaptions: false,
        }));

      return {
        kind: 'resolved',
        url: file.url,
        fidelity: original ? 'original' : 'rendition',
        captions,
      };
    },
  };
}
