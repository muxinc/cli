import { MigrationFailure } from './errors.ts';

export interface HttpClientOptions {
  /** Provider ID, used for error codes such as `VIMEO_UNAUTHORIZED`. */
  provider: string;
  baseUrl: string;
  headers(): Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  maxRetries?: number;
  rateLimit?: { requests: number; perMs: number };
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

/** A provider API failure with a stable code and the HTTP status, when there was one. */
export class ProviderHttpError extends MigrationFailure {
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super({ code, message });
    this.status = status;
  }
}

export interface HttpClient {
  get<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  /** The raw response, for callers that need headers or non-JSON bodies. */
  request(
    method: string,
    path: string,
    options?: RequestOptions & { body?: RequestInit['body'] },
  ): Promise<Response>;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

function retryAfterMs(response: Response, now: number): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
}

async function errorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    const detail =
      body?.error ??
      body?.message ??
      body?.errors?.[0]?.message ??
      body?.developer_message;
    if (typeof detail === 'string') return detail;
  } catch {}
  return text.slice(0, 200);
}

function errorCode(provider: string, status: number): string {
  const prefix = provider.toUpperCase().replaceAll('-', '_');
  if (status === 401) return `${prefix}_UNAUTHORIZED`;
  if (status === 403) return `${prefix}_FORBIDDEN`;
  if (status === 404) return `${prefix}_NOT_FOUND`;
  return `${prefix}_HTTP_${status}`;
}

/**
 * The one HTTP client every provider uses. It honors Retry-After, retries 429,
 * 5xx, and network failures with jittered exponential backoff, spaces requests
 * to the provider's rate limit, and maps failures to provider error codes.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const now = options.now ?? Date.now;
  const maxRetries = options.maxRetries ?? 5;
  const sent: number[] = [];

  async function throttle(): Promise<void> {
    const limit = options.rateLimit;
    if (!limit) return;
    while (true) {
      const windowStart = now() - limit.perMs;
      while (sent.length > 0 && sent[0] <= windowStart) sent.shift();
      if (sent.length < limit.requests) break;
      await sleep(sent[0] - windowStart);
    }
    sent.push(now());
  }

  function url(path: string, query?: RequestOptions['query']): string {
    const target = new URL(
      /^https?:\/\//.test(path) ? path : `${options.baseUrl}${path}`,
    );
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
    return target.toString();
  }

  async function request(
    method: string,
    path: string,
    requestOptions: RequestOptions & { body?: RequestInit['body'] } = {},
  ): Promise<Response> {
    const target = url(path, requestOptions.query);
    for (let attempt = 0; ; attempt++) {
      await throttle();
      let response: Response;
      try {
        response = await fetchImpl(target, {
          method,
          headers: { ...(await options.headers()), ...requestOptions.headers },
          body: requestOptions.body,
        });
      } catch (error) {
        if (attempt >= maxRetries) {
          throw new ProviderHttpError(
            `${options.provider.toUpperCase().replaceAll('-', '_')}_UNREACHABLE`,
            `Could not reach ${new URL(target).host}: ${(error as Error).message}`,
          );
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      if (response.ok) return response;
      if (RETRYABLE(response.status) && attempt < maxRetries) {
        await response.body?.cancel().catch(() => {});
        await sleep(retryAfterMs(response, now()) ?? backoffMs(attempt));
        continue;
      }
      const detail = await errorDetail(response);
      throw new ProviderHttpError(
        errorCode(options.provider, response.status),
        `${method} ${new URL(target).pathname} failed with HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
        response.status,
      );
    }
  }

  async function json<T>(response: Response): Promise<T> {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    async get(path, requestOptions) {
      return json(await request('GET', path, requestOptions));
    },
    async post(path, body, requestOptions) {
      return json(
        await request('POST', path, {
          ...requestOptions,
          headers: {
            'Content-Type': 'application/json',
            ...requestOptions?.headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    },
  };
}
