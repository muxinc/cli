import { describe, expect, test } from 'bun:test';
import { parseSSEStream, type SSEEvent } from './sse.ts';

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of parseSSEStream(stream, signal)) {
    events.push(event);
  }
  return events;
}

describe('parseSSEStream', () => {
  test('parses a single event', async () => {
    const stream = createStream(['event: greeting\ndata: hello\n\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'greeting', data: 'hello' }]);
  });

  test('parses multiple events', async () => {
    const stream = createStream([
      'event: a\ndata: first\n\nevent: b\ndata: second\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toEqual([
      { event: 'a', data: 'first' },
      { event: 'b', data: 'second' },
    ]);
  });

  test('handles chunked delivery across event boundaries', async () => {
    const stream = createStream(['event: test\n', 'data: chunked\n', '\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'test', data: 'chunked' }]);
  });

  test('handles chunk splitting mid-line', async () => {
    const stream = createStream(['event: te', 'st\ndata: val', 'ue\n\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'test', data: 'value' }]);
  });

  test('handles multi-line data fields', async () => {
    const stream = createStream([
      'event: multi\ndata: line1\ndata: line2\ndata: line3\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'multi', data: 'line1\nline2\nline3' }]);
  });

  test('skips heartbeat comments', async () => {
    const stream = createStream([
      ': heartbeat\nevent: real\ndata: payload\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'real', data: 'payload' }]);
  });

  test('skips comment-only blocks', async () => {
    const stream = createStream([
      ': keep-alive\n\nevent: actual\ndata: data\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'actual', data: 'data' }]);
  });

  test('defaults event type to "message" when not specified', async () => {
    const stream = createStream(['data: no-event-field\n\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'message', data: 'no-event-field' }]);
  });

  test('handles data with JSON payload', async () => {
    const json = JSON.stringify({ id: 'evt_123', type: 'video.asset.ready' });
    const stream = createStream([`event: webhook.event\ndata: ${json}\n\n`]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('webhook.event');
    expect(JSON.parse(events[0].data)).toEqual({
      id: 'evt_123',
      type: 'video.asset.ready',
    });
  });

  test('handles data field with no space after colon', async () => {
    const stream = createStream(['event:nospace\ndata:value\n\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'nospace', data: 'value' }]);
  });

  test('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = createStream(['event: test\ndata: data\n\n']);
    const events = await collectEvents(stream, controller.signal);
    expect(events).toEqual([]);
  });

  test('yields no events from empty stream', async () => {
    const stream = createStream([]);
    const events = await collectEvents(stream);
    expect(events).toEqual([]);
  });

  test('ignores lines without colons', async () => {
    const stream = createStream(['nocolon\nevent: valid\ndata: ok\n\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'valid', data: 'ok' }]);
  });

  test('handles \\r\\n line endings', async () => {
    const stream = createStream(['event: greeting\r\ndata: hello\r\n\r\n']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'greeting', data: 'hello' }]);
  });

  test('handles bare \\r line endings', async () => {
    const stream = createStream(['event: greeting\rdata: hello\r\r']);
    const events = await collectEvents(stream);
    expect(events).toEqual([{ event: 'greeting', data: 'hello' }]);
  });

  test('handles mixed line endings', async () => {
    const stream = createStream([
      'event: a\r\ndata: first\n\nevent: b\rdata: second\r\n\r\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toEqual([
      { event: 'a', data: 'first' },
      { event: 'b', data: 'second' },
    ]);
  });
});
