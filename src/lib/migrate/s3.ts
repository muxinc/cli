import { createHash, createHmac } from 'node:crypto';
import { createHttpClient, ProviderHttpError } from './http.ts';

/** An S3-compatible bucket: AWS S3, Cloudflare R2, GCS interoperability, or MinIO. */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** A custom endpoint such as `https://<account>.r2.cloudflarestorage.com`. Uses path-style addressing unless `forcePathStyle` is false. */
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

export interface S3RequestOptions {
  fetch?: typeof fetch;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}

export const MAX_PRESIGN_SECONDS = 604_800;

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const UNAUTHORIZED_CODES = new Set([
  'AccessDenied',
  'SignatureDoesNotMatch',
  'InvalidAccessKeyId',
]);

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** Percent-encodes everything except RFC 3986 unreserved characters. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(key: string): string {
  return key.split('/').map(encode).join('/');
}

function amzDate(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function location(
  config: S3Config,
  key: string,
): { host: string; path: string; origin: string } {
  const encoded = encodeKey(key);
  const endpoint = config.endpoint
    ? new URL(config.endpoint)
    : new URL(`https://s3.${config.region}.amazonaws.com`);
  // Dotted bucket names do not match the wildcard TLS certificate on AWS.
  const pathStyle = config.endpoint
    ? config.forcePathStyle !== false
    : config.forcePathStyle === true || config.bucket.includes('.');
  const host = pathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const path = pathStyle
    ? `/${config.bucket}${key ? `/${encoded}` : ''}`
    : `/${encoded}`;
  return { host, path, origin: `${endpoint.protocol}//${host}` };
}

/** The unsigned URL of an object, with the key encoded per RFC 3986. */
export function objectUrl(config: S3Config, key: string): string {
  const { origin, path } = location(config, key);
  return `${origin}${path}`;
}

function canonicalQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([name, value]) => [encode(name), encode(value)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function signature(
  config: S3Config,
  input: {
    method: string;
    path: string;
    query: string;
    headers: Record<string, string>;
    payloadHash: string;
    timestamp: string;
  },
): { signature: string; signedHeaders: string } {
  const names = Object.keys(input.headers).sort();
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    input.method,
    input.path,
    input.query,
    ...names.map((name) => `${name}:${input.headers[name]}`),
    '',
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const date = input.timestamp.slice(0, 8);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    input.timestamp,
    `${date}/${config.region}/s3/aws4_request`,
    sha256(canonicalRequest),
  ].join('\n');
  let key = hmac(`AWS4${config.secretAccessKey}`, date);
  for (const part of [config.region, 's3', 'aws4_request']) {
    key = hmac(key, part);
  }
  return {
    signature: createHmac('sha256', key).update(stringToSign).digest('hex'),
    signedHeaders,
  };
}

function credentialScope(config: S3Config, timestamp: string): string {
  return `${config.accessKeyId}/${timestamp.slice(0, 8)}/${config.region}/s3/aws4_request`;
}

/**
 * Signs a request with an Authorization header (AWS Signature Version 4).
 * Returns the request URL and the headers to send, which exclude `host`.
 */
export function signRequest(
  config: S3Config,
  request: {
    method: string;
    key?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    payloadHash?: string;
    now?: Date;
  },
): { url: string; headers: Record<string, string> } {
  const { host, path, origin } = location(config, request.key ?? '');
  const timestamp = amzDate(request.now ?? new Date());
  const payloadHash = request.payloadHash ?? EMPTY_SHA256;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  }
  headers.host = host;
  headers['x-amz-content-sha256'] = payloadHash;
  headers['x-amz-date'] = timestamp;
  if (config.sessionToken)
    headers['x-amz-security-token'] = config.sessionToken;

  const query = canonicalQuery(request.query ?? {});
  const signed = signature(config, {
    method: request.method,
    path,
    query,
    headers,
    payloadHash,
    timestamp,
  });
  const { host: _host, ...sent } = headers;
  return {
    url: `${origin}${path}${query ? `?${query}` : ''}`,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${credentialScope(config, timestamp)},SignedHeaders=${signed.signedHeaders},Signature=${signed.signature}`,
    },
  };
}

/** A presigned URL (query-string authentication), valid for at most seven days. */
export function presignUrl(
  config: S3Config,
  request: {
    method: 'GET' | 'PUT' | 'DELETE';
    key: string;
    expiresSeconds: number;
    now?: Date;
    contentType?: string;
  },
): string {
  const { host, path, origin } = location(config, request.key);
  const timestamp = amzDate(request.now ?? new Date());
  const headers: Record<string, string> = { host };
  if (request.contentType) headers['content-type'] = request.contentType;
  const expires = Math.min(
    MAX_PRESIGN_SECONDS,
    Math.max(1, Math.floor(request.expiresSeconds)),
  );
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credentialScope(config, timestamp),
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': Object.keys(headers).sort().join(';'),
  };
  if (config.sessionToken) params['X-Amz-Security-Token'] = config.sessionToken;
  const query = canonicalQuery(params);
  const signed = signature(config, {
    method: request.method,
    path,
    query,
    headers,
    payloadHash: UNSIGNED_PAYLOAD,
    timestamp,
  });
  return `${origin}${path}?${query}&X-Amz-Signature=${signed.signature}`;
}

function decodeXml(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_, entity: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      const lower = entity.toLowerCase();
      if (lower in named) return named[lower];
      return String.fromCodePoint(
        lower.startsWith('#x')
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10),
      );
    },
  );
}

function xmlTag(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]) : undefined;
}

function s3Failure(
  config: S3Config,
  method: string,
  key: string,
  status: number,
  body: string,
): ProviderHttpError {
  const s3Code = xmlTag(body, 'Code');
  const detail = [s3Code, xmlTag(body, 'Message')].filter(Boolean).join(': ');
  let code = `BUCKET_HTTP_${status}`;
  let hint: string | undefined;
  if (status === 403 && s3Code && UNAUTHORIZED_CODES.has(s3Code)) {
    code = 'BUCKET_UNAUTHORIZED';
    hint =
      'Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN, and that the key may list and read objects in the bucket.';
  } else if (status === 404 && s3Code === 'NoSuchBucket') {
    code = 'BUCKET_NOT_FOUND';
    hint = 'Check the bucket name, AWS_REGION, and AWS_ENDPOINT_URL.';
  }
  const error = new ProviderHttpError(
    code,
    `${method} s3://${config.bucket}/${key} failed with HTTP ${status}${detail ? ` (${detail})` : '.'}`,
    status,
  );
  error.hint = hint;
  return error;
}

/** Sends a header-signed request, retrying throttling, 5xx, and network failures. */
async function send(
  config: S3Config,
  request: {
    method: string;
    key?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
  },
  options: S3RequestOptions,
): Promise<Response> {
  const payloadHash =
    request.body === undefined ? EMPTY_SHA256 : sha256(request.body);
  const signed = signRequest(config, {
    ...request,
    payloadHash,
    now: options.now,
  });
  const fetchImpl = options.fetch ?? fetch;
  let errorBody = '';
  const client = createHttpClient({
    provider: 'bucket',
    baseUrl: '',
    headers: () => ({}),
    sleep: options.sleep,
    // Keeps the S3 error document, which the shared client would otherwise truncate.
    fetch: (async (input, init) => {
      const response = await fetchImpl(input, init);
      if (response.ok || response.status === 304) return response;
      errorBody = await response.text().catch(() => '');
      return new Response(errorBody, {
        status: response.status,
        headers: response.headers,
      });
    }) as typeof fetch,
  });
  try {
    return await client.request(request.method, signed.url, {
      headers: signed.headers,
      body: request.body,
    });
  } catch (error) {
    if (error instanceof ProviderHttpError && error.status !== undefined) {
      throw s3Failure(
        config,
        request.method,
        request.key ?? '',
        error.status,
        errorBody,
      );
    }
    throw error;
  }
}

/** One page of ListObjectsV2 (up to 1,000 keys, in UTF-8 binary order). */
export async function listObjects(
  config: S3Config,
  options: S3RequestOptions & {
    prefix?: string;
    continuationToken?: string;
    maxKeys?: number;
  } = {},
): Promise<{ objects: S3Object[]; nextContinuationToken?: string }> {
  const query: Record<string, string> = { 'list-type': '2' };
  if (options.prefix) query.prefix = options.prefix;
  if (options.continuationToken) {
    query['continuation-token'] = options.continuationToken;
  }
  if (options.maxKeys !== undefined)
    query['max-keys'] = String(options.maxKeys);

  const response = await send(config, { method: 'GET', query }, options);
  const xml = await response.text();
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(
    ([, entry]) => ({
      key: xmlTag(entry, 'Key') ?? '',
      size: Number(xmlTag(entry, 'Size') ?? 0),
      lastModified: xmlTag(entry, 'LastModified') ?? '',
    }),
  );
  const next =
    xmlTag(xml, 'IsTruncated') === 'true'
      ? xmlTag(xml, 'NextContinuationToken')
      : undefined;
  return { objects, ...(next && { nextContinuationToken: next }) };
}

export async function getObjectText(
  config: S3Config,
  options: S3RequestOptions & { key: string },
): Promise<string> {
  const response = await send(
    config,
    { method: 'GET', key: options.key },
    options,
  );
  return response.text();
}

export async function putObject(
  config: S3Config,
  options: S3RequestOptions & {
    key: string;
    body: string | Uint8Array;
    contentType?: string;
  },
): Promise<void> {
  const response = await send(
    config,
    {
      method: 'PUT',
      key: options.key,
      body: options.body,
      headers: options.contentType
        ? { 'content-type': options.contentType }
        : undefined,
    },
    options,
  );
  await response.body?.cancel().catch(() => {});
}

export async function deleteObject(
  config: S3Config,
  options: S3RequestOptions & { key: string },
): Promise<void> {
  const response = await send(
    config,
    { method: 'DELETE', key: options.key },
    options,
  );
  await response.body?.cancel().catch(() => {});
}
