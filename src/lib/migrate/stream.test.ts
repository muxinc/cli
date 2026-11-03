import { describe, expect, test } from 'bun:test';
import { createStreamEventSource } from './stream.ts';
import type { StreamMessage } from './types.ts';

const encoder = new TextEncoder();

function sse(...events: Array<{ event?: string; data: unknown }>): string {
  return events
    .map(
      (e) =>
        `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`,
    )
    .join('');
}

/** A response whose body stays open until `close` is called. */
function openStream(initial: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      if (initial) c.enqueue(encoder.encode(initial));
    },
  });
  return {
    response: new Response(body, { status: 200 }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

function source(responses: Array<() => Response>, refresh = async () => true) {
  const calls: Array<Record<string, string>> = [];
  let refreshes = 0;
  const events = createStreamEventSource({
    url: 'https://api.mux.test/system/v1/webhook-events/stream',
    getHeaders: async () => ({ Authorization: `Bearer token-${calls.length}` }),
    refreshCredentials: async () => {
      refreshes++;
      return refresh();
    },
    fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>);
      const next = responses.shift();
      if (!next) return new Promise<Response>(() => {});
      return next();
    }) as typeof fetch,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
  });
  return { events, calls, refreshes: () => refreshes };
}

async function take(
  iterable: AsyncIterable<StreamMessage>,
  count: number,
): Promise<StreamMessage[]> {
  const messages: StreamMessage[] = [];
  for await (const message of iterable) {
    messages.push(message);
    if (messages.length === count) break;
  }
  return messages;
}

const assetCreated = {
  id: 'evt_1',
  type: 'video.asset.created',
  data: { id: 'asset_1', meta: { external_id: 'manifest:a' } },
};

describe('createStreamEventSource', () => {
  test('yields webhook events parsed from the stream', async () => {
    const stream = openStream(
      sse(
        { event: 'connected', data: '{}' },
        { data: 'not json' },
        { data: assetCreated },
      ),
    );
    const { events } = source([() => stream.response]);
    const controller = new AbortController();

    const iterable = await events.open(controller.signal);
    const [message] = await take(iterable, 1);
    controller.abort();

    expect(message).toEqual({
      kind: 'event',
      event: {
        id: 'evt_1',
        type: 'video.asset.created',
        data: { id: 'asset_1', meta: { external_id: 'manifest:a' } },
      },
    });
  });

  test('open resolves only once the connection is established', async () => {
    let respond!: (response: Response) => void;
    const { events } = source([
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }) as unknown as Response,
    ]);
    let opened = false;
    const opening = events.open(new AbortController().signal).then(() => {
      opened = true;
    });

    await Bun.sleep(5);
    expect(opened).toBe(false);
    respond(openStream('').response);
    await opening;
    expect(opened).toBe(true);
  });

  test('reconnects after the stream ends and reports the gap', async () => {
    const first = openStream(sse({ data: assetCreated }));
    const second = openStream(
      sse({
        data: { ...assetCreated, id: 'evt_2', type: 'video.asset.ready' },
      }),
    );
    const { events, calls } = source([
      () => first.response,
      () => second.response,
    ]);
    const controller = new AbortController();

    const iterable = await events.open(controller.signal);
    setTimeout(() => first.close(), 5);
    const messages = await take(iterable, 3);
    controller.abort();

    expect(
      messages.map((m) => (m.kind === 'event' ? m.event.id : m.kind)),
    ).toEqual(['evt_1', 'reconnected', 'evt_2']);
    expect(calls).toHaveLength(2);
  });

  test('refreshes credentials once after a 401, then connects', async () => {
    const stream = openStream(sse({ data: assetCreated }));
    const { events, calls, refreshes } = source([
      () => new Response('', { status: 401 }),
      () => stream.response,
    ]);
    const controller = new AbortController();

    const iterable = await events.open(controller.signal);
    await take(iterable, 1);
    controller.abort();

    expect(refreshes()).toBe(1);
    expect(calls[1]).not.toEqual(calls[0]);
  });

  test('open fails with STREAM_UNAUTHORIZED when access is denied', async () => {
    const { events } = source([() => new Response('', { status: 403 })]);

    await expect(
      events.open(new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'STREAM_UNAUTHORIZED',
    });
  });

  test('open fails with STREAM_UNAUTHORIZED when a refresh does not help', async () => {
    const { events } = source(
      [
        () => new Response('', { status: 401 }),
        () => new Response('', { status: 401 }),
      ],
      async () => true,
    );

    await expect(
      events.open(new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'STREAM_UNAUTHORIZED',
    });
  });

  test('aborting ends iteration', async () => {
    const stream = openStream('');
    const { events } = source([() => stream.response]);
    const controller = new AbortController();

    const iterable = await events.open(controller.signal);
    setTimeout(() => controller.abort(), 5);
    const messages = await take(iterable, 1);

    expect(messages).toEqual([]);
  });
});
