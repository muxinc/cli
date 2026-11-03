import { MigrationFailure } from '../errors.ts';
import {
  getObjectText,
  listObjects,
  MAX_PRESIGN_SECONDS,
  objectUrl,
  presignUrl,
  type S3Config,
  type S3Object,
} from '../s3.ts';
import type {
  CaptionSource,
  MigrationError,
  SourceItem,
  SourceProvider,
} from '../types.ts';
import { envCredentials } from './credentials.ts';

export interface BucketCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
  endpoint?: string;
}

/** The recipe's `source` block for an S3-compatible bucket. */
export interface BucketSourceOptions {
  bucket: string;
  prefix?: string;
  /** File extensions to migrate, case-insensitive. Defaults to common video and audio formats. */
  extensions?: string[];
  /** A glob matched against the full object key, such as `courses/**\/*.mp4`. */
  glob?: string;
  /** Lifetime of presigned URLs. Defaults to 24 hours, at most seven days. */
  url_ttl_seconds?: number;
}

interface CaptionFile {
  key: string;
  language: string;
}

interface BucketRaw {
  key: string;
  size: number;
  lastModified: string;
  captions: CaptionFile[];
  sidecar?: string;
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mxf'];
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav']);
const DEFAULT_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const CAPTION_FILE = /^(.+)\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.(vtt|srt)$/;
const DEFAULT_TTL_SECONDS = 86_400;
const SIDECAR_CONCURRENCY = 8;

function extension(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function withoutExtension(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot > key.lastIndexOf('/') + 1 ? key.slice(0, dot) : key;
}

/** Objects that may be a video or one of its sidecars share this key. */
function groupKey(key: string): string {
  const slash = key.lastIndexOf('/') + 1;
  const dot = key.indexOf('.', slash + 1);
  return dot === -1 ? key : key.slice(0, dot);
}

function requireBucket(source: BucketSourceOptions | undefined): string {
  if (!source?.bucket) {
    throw new MigrationFailure({
      code: 'BUCKET_NAME_REQUIRED',
      message: 'No bucket is configured for the migration.',
      hint: 'Set source.bucket in the recipe to the name of the bucket to migrate from.',
    });
  }
  return source.bucket;
}

function s3Config(creds: BucketCredentials, bucket: string): S3Config {
  return { ...creds, bucket };
}

interface Cursor {
  token?: string;
  /** Objects held back from the previous page because their sidecars may follow. */
  carry: S3Object[];
}

function readCursor(cursor: string | undefined): Cursor {
  if (!cursor) return { carry: [] };
  return JSON.parse(cursor) as Cursor;
}

function sidecarFields(
  metadata: unknown,
): Pick<SourceItem, 'title' | 'description' | 'tags' | 'passthrough'> {
  const fields = (metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === 'string' && value !== '' ? value : undefined;
  const { passthrough } = fields;
  return {
    title: text(fields.title),
    description: text(fields.description),
    tags: Array.isArray(fields.tags) ? fields.tags.map(String) : undefined,
    passthrough:
      passthrough === undefined || passthrough === null
        ? undefined
        : typeof passthrough === 'string'
          ? passthrough
          : JSON.stringify(passthrough),
  };
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await fn(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return results;
}

function embedPatterns(config: S3Config, key: string): string[] {
  const virtual = objectUrl({ ...config, forcePathStyle: false }, key);
  const path = objectUrl({ ...config, forcePathStyle: true }, key);
  return [key, virtual, path].map((url) => url.replace(/^https?:\/\//, ''));
}

/** Migrates objects from an S3-compatible bucket. See MIGRATE_SPEC.md "Bucket". */
export function createBucketProvider(options: {
  source?: BucketSourceOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}): SourceProvider<BucketCredentials> {
  const source = options.source;
  const now = options.now ?? (() => new Date());
  const extensions = new Set(
    (source?.extensions ?? DEFAULT_EXTENSIONS).map((ext) =>
      ext.replace(/^\./, '').toLowerCase(),
    ),
  );
  const glob = source?.glob ? new Bun.Glob(source.glob) : undefined;
  const ttl = Math.min(
    MAX_PRESIGN_SECONDS,
    source?.url_ttl_seconds ?? DEFAULT_TTL_SECONDS,
  );
  const request = () => ({
    fetch: options.fetch,
    sleep: options.sleep,
    now: now(),
  });

  const isMedia = (key: string) =>
    !key.endsWith('/') &&
    extensions.has(extension(key)) &&
    (!glob || glob.match(key));

  const spec = envCredentials('S3-compatible bucket', 'BUCKET', [
    {
      key: 'accessKeyId',
      name: 'AWS_ACCESS_KEY_ID',
      required: true,
      description: 'The access key ID of a key that can list and read objects.',
    },
    {
      key: 'secretAccessKey',
      name: 'AWS_SECRET_ACCESS_KEY',
      required: true,
      description: 'The secret access key for AWS_ACCESS_KEY_ID.',
    },
    {
      key: 'region',
      name: 'AWS_REGION',
      required: true,
      description: 'The bucket region, such as us-east-1. Use auto for R2.',
    },
    {
      key: 'sessionToken',
      name: 'AWS_SESSION_TOKEN',
      required: false,
      description: 'A session token, for temporary credentials.',
    },
    {
      key: 'endpoint',
      name: 'AWS_ENDPOINT_URL',
      required: false,
      description:
        'A custom endpoint for R2, GCS interoperability, or MinIO, such as https://<account>.r2.cloudflarestorage.com.',
    },
  ]);

  async function toItems(
    config: S3Config,
    objects: S3Object[],
  ): Promise<{ items: SourceItem[]; warnings: MigrationError[] }> {
    const keys = new Set(objects.map((o) => o.key));
    const captions = new Map<string, CaptionFile[]>();
    for (const { key } of objects) {
      const match = CAPTION_FILE.exec(key);
      if (!match) continue;
      const files = captions.get(match[1]) ?? [];
      files.push({ key, language: match[2] });
      captions.set(match[1], files);
    }

    const media = objects.filter((o) => isMedia(o.key));
    const warnings: MigrationError[] = [];
    const metadata = await mapLimit(media, SIDECAR_CONCURRENCY, async (o) => {
      const sidecar = `${o.key}.json`;
      if (!keys.has(sidecar)) return undefined;
      const text = await getObjectText(config, { key: sidecar, ...request() });
      try {
        return { sidecar, fields: sidecarFields(JSON.parse(text)) };
      } catch (error) {
        warnings.push({
          code: 'BUCKET_SIDECAR_INVALID',
          message: `Ignored the metadata sidecar ${sidecar}, which is not valid JSON: ${(error as Error).message}`,
        });
        return undefined;
      }
    });

    const items = media.map((o, index): SourceItem => {
      const name = o.key.slice(o.key.lastIndexOf('/') + 1);
      const folder = o.key.slice(0, Math.max(0, o.key.lastIndexOf('/')));
      const files = captions.get(withoutExtension(o.key)) ?? [];
      const sidecar = metadata[index];
      const raw: BucketRaw = {
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
        captions: files,
        ...(sidecar && { sidecar: sidecar.sidecar }),
      };
      return {
        sourceId: o.key,
        type: AUDIO_EXTENSIONS.has(extension(o.key)) ? 'audio' : 'video',
        exportable: o.size > 0,
        skipReason: o.size > 0 ? undefined : 'The object is empty',
        title: withoutExtension(name),
        ...(folder && { folder }),
        sizeBytes: o.size,
        createdAt: o.lastModified || undefined,
        sourceUrl: `s3://${config.bucket}/${o.key}`,
        embedPatterns: embedPatterns(config, o.key),
        captionCount: files.length,
        captionLanguages: files.map((file) => file.language),
        expectedFidelity: 'original',
        ...Object.fromEntries(
          Object.entries(sidecar?.fields ?? {}).filter(
            ([, value]) => value !== undefined,
          ),
        ),
        raw,
      };
    });
    return { items, warnings };
  }

  return {
    id: 'bucket',
    defaultConcurrency: 8,
    credentials: {
      variables: spec.variables,
      read: (env) => {
        const values = spec.read(env);
        return {
          accessKeyId: values.accessKeyId as string,
          secretAccessKey: values.secretAccessKey as string,
          region: values.region as string,
          ...(values.sessionToken && { sessionToken: values.sessionToken }),
          ...(values.endpoint && { endpoint: values.endpoint }),
        };
      },
    },

    async verify(creds) {
      try {
        const bucket = requireBucket(source);
        await listObjects(s3Config(creds, bucket), {
          prefix: source?.prefix,
          maxKeys: 1,
          ...request(),
        });
        return { ok: true, warnings: [] };
      } catch (error) {
        if (error instanceof MigrationFailure) {
          return { ok: false, warnings: [error.toJSON()] };
        }
        return {
          ok: false,
          warnings: [
            {
              code: 'BUCKET_UNREACHABLE',
              message: `Could not reach the bucket: ${error instanceof Error ? error.message : String(error)}`,
              hint: 'Check AWS_REGION and AWS_ENDPOINT_URL.',
            },
          ],
        };
      }
    },

    async list(creds, cursor) {
      const config = s3Config(creds, requireBucket(source));
      const { token, carry } = readCursor(cursor);
      const page = await listObjects(config, {
        prefix: source?.prefix,
        continuationToken: token,
        ...request(),
      });
      const objects = [...carry, ...page.objects];
      const next = page.nextContinuationToken;

      // Keys are sorted, so a video's sidecars may continue on the next page.
      let split = objects.length;
      if (next && objects.length > 0) {
        const last = groupKey(objects[objects.length - 1].key);
        while (split > 0 && groupKey(objects[split - 1].key) === last) split--;
      }
      const { items, warnings } = await toItems(
        config,
        objects.slice(0, split),
      );
      return {
        items,
        ...(next && {
          next: JSON.stringify({
            token: next,
            carry: objects.slice(split),
          } satisfies Cursor),
        }),
        ...(warnings.length > 0 && { warnings }),
      };
    },

    async resolve(creds, item) {
      const config = s3Config(creds, requireBucket(source));
      const raw = item.raw as BucketRaw;
      const issuedAt = now();
      const presign = (key: string) =>
        presignUrl(config, {
          method: 'GET',
          key,
          expiresSeconds: ttl,
          now: issuedAt,
        });
      return {
        kind: 'resolved',
        url: presign(raw.key),
        fidelity: 'original',
        expiresAt: new Date(issuedAt.getTime() + ttl * 1000),
        captions: raw.captions.map(
          (file): CaptionSource => ({
            kind: 'url',
            url: presign(file.key),
            language: file.language,
            closedCaptions: false,
          }),
        ),
      };
    },
  };
}
