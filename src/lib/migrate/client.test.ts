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
  return { client: createMuxMigrateClient(mux), requests };
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
});
