import { describe, expect, test } from 'bun:test';
import { createHttpClient } from './http.ts';

function client(
  responses: Array<() => Response | Promise<Response>>,
  options: { rateLimit?: { requests: number; perMs: number } } = {},
) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const sleeps: number[] = [];
  let now = 0;
  const http = createHttpClient({
    provider: 'vimeo',
    baseUrl: 'https://api.vimeo.test',
    headers: async () => ({ Authorization: 'Bearer token' }),
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const next = responses.shift();
      if (!next) throw new Error('Unexpected request');
      return next();
    }) as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    now: () => now,
    rateLimit: options.rateLimit,
  });
  return { http, requests, sleeps };
}

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('createHttpClient', () => {
  test('sends requests to the base URL with auth headers and query parameters', async () => {
    const { http, requests } = client([() => json(200, { ok: true })]);

    const body = await http.get('/me/videos', {
      query: { per_page: 100, fields: 'uri' },
    });

    expect(body).toEqual({ ok: true });
    expect(requests[0].url).toBe(
      'https://api.vimeo.test/me/videos?per_page=100&fields=uri',
    );
    expect(
      (requests[0].init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer token');
  });

  test('accepts absolute URLs, such as pagination links', async () => {
    const { http, requests } = client([() => json(200, {})]);

    await http.get('https://other.test/page/2');

    expect(requests[0].url).toBe('https://other.test/page/2');
  });

  test('retries 429 responses after Retry-After', async () => {
    const { http, requests, sleeps } = client([
      () => json(429, {}, { 'retry-after': '7' }),
      () => json(200, { ok: true }),
    ]);

    await http.get('/x');

    expect(requests).toHaveLength(2);
    expect(sleeps).toContain(7000);
  });

  test('retries 5xx responses and network errors with growing backoff', async () => {
    const { http, requests, sleeps } = client([
      () => json(503, {}),
      () => {
        throw new TypeError('fetch failed');
      },
      () => json(200, { ok: true }),
    ]);

    await http.get('/x');

    expect(requests).toHaveLength(3);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  test('gives up after the retry limit with a provider error code', async () => {
    const { http } = client(
      Array.from({ length: 10 }, () => () => json(502, {})),
    );

    await expect(http.get('/x')).rejects.toMatchObject({
      code: 'VIMEO_HTTP_502',
      status: 502,
    });
  });

  test.each([
    [401, 'VIMEO_UNAUTHORIZED'],
    [403, 'VIMEO_FORBIDDEN'],
    [404, 'VIMEO_NOT_FOUND'],
    [400, 'VIMEO_HTTP_400'],
  ])('maps %i to %s without retrying', async (status, code) => {
    const { http, requests } = client([() => json(status, { error: 'nope' })]);

    await expect(http.get('/x')).rejects.toMatchObject({ code, status });
    expect(requests).toHaveLength(1);
  });

  test('includes the provider error message in the failure', async () => {
    const { http } = client([
      () => json(400, { error: 'The per_page value is invalid.' }),
    ]);

    await expect(http.get('/x')).rejects.toMatchObject({
      message: expect.stringContaining('The per_page value is invalid.'),
    });
  });

  test('spaces requests to stay within the rate limit', async () => {
    const { http, sleeps } = client(
      Array.from({ length: 3 }, () => () => json(200, {})),
      { rateLimit: { requests: 2, perMs: 1000 } },
    );

    await http.get('/a');
    await http.get('/b');
    await http.get('/c');

    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(
      1000,
    );
  });

  test('posts JSON bodies', async () => {
    const { http, requests } = client([() => json(200, { id: 1 })]);

    await http.post('/downloads', { quality: 'source' });

    expect(requests[0].init?.method).toBe('POST');
    expect(requests[0].init?.body).toBe('{"quality":"source"}');
    expect(
      (requests[0].init?.headers as Record<string, string>)['Content-Type'],
    ).toBe('application/json');
  });
});
