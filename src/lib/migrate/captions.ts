import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { envCredentials } from './providers/credentials.ts';
import { deleteObject, presignUrl, putObject, type S3Config } from './s3.ts';
import type { CaptionHandler, TextCaption } from './types.ts';

/** Saves caption text under `{stateDir}/captions/` for the customer to host later. */
export function createLocalCaptionStore(stateDir: string): CaptionHandler {
  return {
    async saveLocal(sourceId: string, caption: TextCaption) {
      const directory = join(stateDir, 'captions');
      await mkdir(directory, { recursive: true });
      const name = sourceId.replace(/[^A-Za-z0-9._-]+/g, '_');
      const path = join(
        directory,
        `${name}.${caption.language}.${caption.format}`,
      );
      await writeFile(path, caption.text);
      return path;
    },
  };
}

const CAPTION_URL_TTL_SECONDS = 24 * 60 * 60;

const CONTENT_TYPES: Record<TextCaption['format'], string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
};

/**
 * Hosts caption text in a bucket the customer owns, for `captions.host_bucket`.
 * Mux fetches each file by a presigned URL that is valid for 24 hours.
 */
export function createBucketCaptionHost(
  config: S3Config,
  options: { fetch?: typeof fetch; now?: () => Date } = {},
): NonNullable<CaptionHandler['host']> {
  const now = options.now ?? (() => new Date());
  return {
    async upload(key, caption) {
      await putObject(config, {
        key,
        body: caption.text,
        contentType: CONTENT_TYPES[caption.format],
        fetch: options.fetch,
        now: now(),
      });
      return presignUrl(config, {
        method: 'GET',
        key,
        expiresSeconds: CAPTION_URL_TTL_SECONDS,
        now: now(),
      });
    },
    async remove(key) {
      await deleteObject(config, { key, fetch: options.fetch, now: now() });
    },
  };
}

const hostCredentials = envCredentials('Caption host bucket', 'CAPTIONS_HOST', [
  {
    key: 'accessKeyId',
    name: 'AWS_ACCESS_KEY_ID',
    required: true,
    description: 'Access key for the bucket named in captions.host_bucket.',
  },
  {
    key: 'secretAccessKey',
    name: 'AWS_SECRET_ACCESS_KEY',
    required: true,
    description: 'Secret key for that access key.',
  },
  {
    key: 'region',
    name: 'AWS_REGION',
    required: true,
    description: 'The bucket region, or "auto" for Cloudflare R2.',
  },
  {
    key: 'sessionToken',
    name: 'AWS_SESSION_TOKEN',
    required: false,
    description: 'Session token for temporary credentials.',
  },
  {
    key: 'endpoint',
    name: 'AWS_ENDPOINT_URL',
    required: false,
    description: 'Endpoint for R2, GCS interoperability, or MinIO.',
  },
]);

/** The S3 configuration for `captions.host_bucket`, from AWS environment variables. */
export function hostBucketConfig(
  bucket: string,
  env: Record<string, string | undefined>,
): S3Config {
  const creds = hostCredentials.read(env);
  return {
    bucket,
    accessKeyId: creds.accessKeyId as string,
    secretAccessKey: creds.secretAccessKey as string,
    region: creds.region as string,
    ...(creds.sessionToken && { sessionToken: creds.sessionToken }),
    ...(creds.endpoint && { endpoint: creds.endpoint }),
  };
}
