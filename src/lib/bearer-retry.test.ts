import { describe, expect, it } from 'bun:test';
import { createBearerRetryFetch } from './bearer-retry.ts';

function authOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

describe('createBearerRetryFetch', () => {
  it('passes a successful request straight through', async () => {
    let calls = 0;
    let refreshes = 0;
    const wrapped = createBearerRetryFetch({
      refresh: async () => {
        refreshes += 1;
        return 'access_2';
      },
      fetchImpl: (async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });

    const response = await wrapped('https://api.test/video/v1/assets');

    expect(response.status).toBe(200);
    expect(calls).toBe(1);
    expect(refreshes).toBe(0);
  });

  it('refreshes once and retries with the new token on 401', async () => {
    const seen: (string | null)[] = [];
    const wrapped = createBearerRetryFetch({
      refresh: async () => 'access_2',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen.push(authOf(init));
        return new Response('{}', { status: seen.length === 1 ? 401 : 200 });
      }) as unknown as typeof fetch,
    });

    const response = await wrapped('https://api.test/video/v1/assets', {
      headers: { Authorization: 'Bearer access_1' },
    });

    expect(response.status).toBe(200);
    expect(seen).toEqual(['Bearer access_1', 'Bearer access_2']);
  });

  it('preserves the method, body, and other headers on the retry', async () => {
    const seen: RequestInit[] = [];
    const wrapped = createBearerRetryFetch({
      refresh: async () => 'access_2',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen.push(init);
        return new Response('{}', { status: seen.length === 1 ? 401 : 200 });
      }) as unknown as typeof fetch,
    });

    await wrapped('https://api.test/video/v1/assets', {
      method: 'POST',
      body: '{"input":"x"}',
      headers: {
        Authorization: 'Bearer access_1',
        'Content-Type': 'application/json',
        'User-Agent': 'Mux CLI/test',
      },
    });

    const retry = seen[1];
    expect(retry.method).toBe('POST');
    expect(retry.body).toBe('{"input":"x"}');
    expect(new Headers(retry.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(new Headers(retry.headers).get('User-Agent')).toBe('Mux CLI/test');
  });

  it('retries only once, so a persistent 401 surfaces to the caller', async () => {
    let calls = 0;
    let refreshes = 0;
    const wrapped = createBearerRetryFetch({
      refresh: async () => {
        refreshes += 1;
        return 'access_2';
      },
      fetchImpl: (async () => {
        calls += 1;
        return new Response('{}', { status: 401 });
      }) as unknown as typeof fetch,
    });

    const response = await wrapped('https://api.test/video/v1/assets');

    expect(response.status).toBe(401);
    expect(calls).toBe(2);
    expect(refreshes).toBe(1);
  });

  it('returns the original 401 when the refresh itself fails', async () => {
    const wrapped = createBearerRetryFetch({
      refresh: async () => {
        throw new Error('refresh token revoked');
      },
      fetchImpl: (async () =>
        new Response('{}', { status: 401 })) as unknown as typeof fetch,
    });

    // The caller's own 401 handling is more useful here than a refresh error
    // raised from inside an unrelated API call.
    const response = await wrapped('https://api.test/video/v1/assets');
    expect(response.status).toBe(401);
  });

  it('does not refresh on other error statuses', async () => {
    let refreshes = 0;
    const wrapped = createBearerRetryFetch({
      refresh: async () => {
        refreshes += 1;
        return 'access_2';
      },
      fetchImpl: (async () =>
        new Response('{}', { status: 403 })) as unknown as typeof fetch,
    });

    expect((await wrapped('https://api.test/x')).status).toBe(403);
    expect(refreshes).toBe(0);
  });

  it('handles a Request object as input', async () => {
    const seen: (string | null)[] = [];
    const wrapped = createBearerRetryFetch({
      refresh: async () => 'access_2',
      fetchImpl: (async (input: Request | string, init?: RequestInit) => {
        const header =
          input instanceof Request
            ? input.headers.get('Authorization')
            : authOf(init);
        seen.push(header);
        return new Response('{}', { status: seen.length === 1 ? 401 : 200 });
      }) as unknown as typeof fetch,
    });

    const response = await wrapped(
      new Request('https://api.test/video/v1/assets', {
        headers: { Authorization: 'Bearer access_1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(seen[0]).toBe('Bearer access_1');
    expect(seen[1]).toBe('Bearer access_2');
  });
});
