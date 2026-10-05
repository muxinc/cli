import { createHttpClient, ProviderHttpError } from '../http.ts';
import type {
  CaptionSource,
  ResolveResult,
  SourceItem,
  SourceProvider,
} from '../types.ts';
import { envCredentials } from './credentials.ts';

export interface VimeoCredentials {
  accessToken: string;
}

/** The recipe's `source` block for Vimeo. */
export interface VimeoSourceOptions {
  folders?: string[];
  include_live_archives?: boolean;
  include_private?: boolean;
}

interface VimeoVideo {
  uri: string;
  name?: string;
  description?: string | null;
  duration?: number;
  created_time?: string;
  link?: string;
  type?: 'video' | 'live' | 'stock';
  privacy?: { view?: string };
  upload?: { status?: string };
  transcode?: { status?: string };
  tags?: Array<{ name: string }>;
  parent_folder?: { name?: string } | null;
  pictures?: { base_link?: string } | null;
  metadata?: { connections?: { texttracks?: { total?: number } } };
}

interface VimeoDownload {
  quality?: string;
  rendition?: string;
  size?: number;
  link: string;
  expires?: string;
}

interface VimeoTextTrack {
  type?: string;
  language?: string;
  link?: string;
  name?: string;
}

const LIST_FIELDS = [
  'uri',
  'name',
  'description',
  'duration',
  'created_time',
  'link',
  'type',
  'privacy.view',
  'upload.status',
  'transcode.status',
  'tags.name',
  'parent_folder.name',
  'pictures.base_link',
  'metadata.connections.texttracks.total',
].join(',');

const CAPTION_TYPES = new Set(['captions', 'subtitles']);

function skipReason(
  video: VimeoVideo,
  source: VimeoSourceOptions,
): string | undefined {
  if (video.type === 'stock') return 'Stock footage cannot be exported';
  if (video.type === 'live' && !source.include_live_archives) {
    return 'Live archive (set source.include_live_archives to include)';
  }
  if (
    video.upload?.status !== 'complete' ||
    video.transcode?.status !== 'complete'
  ) {
    return 'Still processing on Vimeo';
  }
  if (source.include_private === false && video.privacy?.view !== 'anybody') {
    return 'Private (source.include_private is false)';
  }
  const folder = video.parent_folder?.name;
  if (source.folders?.length && !(folder && source.folders.includes(folder))) {
    return 'Not in a selected folder';
  }
  return undefined;
}

function toSourceItem(
  video: VimeoVideo,
  source: VimeoSourceOptions,
): SourceItem {
  const id = video.uri.split('/').pop() as string;
  const reason = skipReason(video, source);
  return {
    sourceId: id,
    type: video.type === 'live' ? 'live_archive' : 'video',
    exportable: reason === undefined,
    skipReason: reason,
    title: video.name,
    description: video.description ?? undefined,
    tags: video.tags?.map((tag) => tag.name),
    folder: video.parent_folder?.name,
    durationSeconds: video.duration,
    createdAt: video.created_time,
    sourceUrl: video.link,
    embedPatterns: [`player.vimeo.com/video/${id}`, `vimeo.com/${id}`],
    posterUrl: video.pictures?.base_link,
    captionCount: video.metadata?.connections?.texttracks?.total ?? 0,
    raw: video,
  };
}

/** The original upload when Vimeo kept it, otherwise the largest rendition. */
function pickDownload(downloads: VimeoDownload[]): VimeoDownload | undefined {
  const source = downloads.find(
    (d) => d.quality === 'source' || d.rendition === 'source',
  );
  if (source) return source;
  return [...downloads].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
}

export function createVimeoProvider(options: {
  source?: VimeoSourceOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): SourceProvider<VimeoCredentials> {
  const source = options.source ?? {};
  const clients = new Map<string, ReturnType<typeof createHttpClient>>();
  const http = (creds: VimeoCredentials) => {
    let client = clients.get(creds.accessToken);
    if (!client) {
      client = createHttpClient({
        provider: 'vimeo',
        baseUrl: 'https://api.vimeo.com',
        headers: () => ({
          Authorization: `Bearer ${creds.accessToken}`,
          Accept: 'application/vnd.vimeo.*+json;version=3.4',
        }),
        fetch: options.fetch,
        sleep: options.sleep,
      });
      clients.set(creds.accessToken, client);
    }
    return client;
  };

  const spec = envCredentials('Vimeo', 'VIMEO', [
    {
      key: 'accessToken',
      name: 'VIMEO_ACCESS_TOKEN',
      required: true,
      description:
        'A personal access token with the public, private, and video_files scopes from https://developer.vimeo.com/apps.',
    },
  ]);

  return {
    id: 'vimeo',
    defaultConcurrency: 4,
    credentials: {
      variables: spec.variables,
      read: (env) => ({ accessToken: spec.read(env).accessToken as string }),
    },

    async verify(creds) {
      try {
        const { scope = '' } = await http(creds).get<{ scope?: string }>(
          '/oauth/verify',
        );
        if (!scope.split(' ').includes('video_files')) {
          return {
            ok: false,
            warnings: [
              {
                code: 'VIMEO_SCOPE_MISSING',
                message:
                  'The Vimeo token does not have the video_files scope, which is required to download source files.',
                hint: 'Create a token with the public, private, and video_files scopes at https://developer.vimeo.com/apps.',
              },
            ],
          };
        }
        return { ok: true, warnings: [] };
      } catch (error) {
        if (error instanceof ProviderHttpError) {
          return { ok: false, warnings: [error.toJSON()] };
        }
        throw error;
      }
    },

    async list(creds, cursor) {
      const page = await http(creds).get<{
        data: VimeoVideo[];
        paging?: { next?: string | null };
      }>(cursor ?? '/me/videos', {
        query: cursor ? undefined : { per_page: 100, fields: LIST_FIELDS },
      });
      return {
        items: page.data.map((video) => toSourceItem(video, source)),
        next: page.paging?.next ?? undefined,
      };
    },

    async resolve(creds, item): Promise<ResolveResult> {
      const client = http(creds);
      const [{ download = [] }, { data: tracks = [] }] = await Promise.all([
        client.get<{ download?: VimeoDownload[] }>(`/videos/${item.sourceId}`, {
          query: { fields: 'download' },
        }),
        client.get<{ data?: VimeoTextTrack[] }>(
          `/videos/${item.sourceId}/texttracks`,
        ),
      ]);

      const file = pickDownload(download);
      if (!file) {
        return {
          kind: 'unavailable',
          code: 'VIMEO_PLAN_NO_DOWNLOADS',
          message: `Vimeo returned no downloadable files for video ${item.sourceId}. Downloads require a paid Vimeo plan and the video_files scope.`,
        };
      }

      const captions: CaptionSource[] = tracks
        .filter(
          (track) =>
            CAPTION_TYPES.has(track.type ?? '') && track.link && track.language,
        )
        .map((track) => ({
          kind: 'url',
          url: track.link as string,
          language: track.language as string,
          label: track.name,
          closedCaptions: track.type === 'captions',
        }));

      const original = file.quality === 'source' || file.rendition === 'source';
      return {
        kind: 'resolved',
        url: file.link,
        fidelity: original ? 'original' : 'rendition',
        ...(file.expires && { expiresAt: new Date(file.expires) }),
        captions,
      };
    },
  };
}
