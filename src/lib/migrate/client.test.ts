import { describe, expect, test } from 'bun:test';
import Mux from '@mux/ts';
import { createMuxMigrateClient } from './client.ts';

function muxWithResponses(responses: Array<() => Response>) {
  const requests: Array<string | URL | Request> = [];
  const fetch = async (input: string | URL | Request, _init?: RequestInit) => {
    requests.push(input);
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return next();
  };
  // maxRetries is left at the SDK default on purpose: the adapter must
  // override it for asset creation.
  const mux = new Mux({
    tokenId: 'test-id',
    tokenSecret: 'test-secret',
    baseURL: 'https://api.mux.test',
    fetch: fetch as typeof globalThis.fetch,
  });
  let now = 0;
  const sleeps: number[] = [];
  const client = createMuxMigrateClient(mux, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  return { client, requests, sleeps, elapsed: () => now };
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

describe('createMuxMigrateClient', () => {
  test('createAsset sends exactly one request when Mux returns a 5xx', async () => {
    const { client, requests } = muxWithResponses([
      () => json(503, { error: { messages: ['Unavailable'] } }),
      () => json(201, { data: { id: 'asset_dup' } }),
    ]);

    await expect(
      client.createAsset({ inputs: [{ url: 'https://x/y.mp4' }] }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });

  test('createAsset retries a 429, because Mux did not process the request', async () => {
    const { client, requests } = muxWithResponses([
      () =>
        json(
          429,
          { error: { messages: ['Slow down'] } },
          { 'retry-after-ms': '1' },
        ),
      () => json(201, { data: { id: 'asset_1', status: 'preparing' } }),
    ]);

    const asset = await client.createAsset({
      inputs: [{ url: 'https://x/y.mp4' }],
    });

    expect(asset.id).toBe('asset_1');
    expect(requests).toHaveLength(2);
  });

  test('retrieveAsset still retries transient failures', async () => {
    const { client, requests } = muxWithResponses([
      () => json(503, {}, { 'retry-after-ms': '1' }),
      () => json(200, { data: { id: 'asset_1', status: 'ready' } }),
    ]);

    const asset = await client.retrieveAsset('asset_1');

    expect(asset.status).toBe('ready');
    expect(requests).toHaveLength(2);
  });

  test('paces asset creation at the Mux create rate limit of one per second', async () => {
    const { client, elapsed } = muxWithResponses(
      Array.from(
        { length: 10 },
        (_, i) => () => json(201, { data: { id: `asset_${i}` } }),
      ),
    );

    for (let i = 0; i < 10; i++) {
      await client.createAsset({ inputs: [{ url: 'https://x/y.mp4' }] });
    }

    // A burst of four, then one per second, which fits a low-priority token.
    expect(elapsed()).toBeGreaterThanOrEqual(6000);
    expect(elapsed()).toBeLessThan(7000);
  });

  test('paces reads separately from creates, one token per list page', async () => {
    const page = (ids: string[]) => () =>
      json(200, { data: ids.map((id) => ({ id })) });
    const { client, requests, elapsed } = muxWithResponses([
      ...Array.from({ length: 30 }, () => page(['a'])),
    ]);

    for (let i = 0; i < 30; i++) await client.retrieveAsset('a');

    expect(requests).toHaveLength(30);
    // A burst of twenty, then one per second.
    expect(elapsed()).toBeGreaterThanOrEqual(10_000);
  });
});
