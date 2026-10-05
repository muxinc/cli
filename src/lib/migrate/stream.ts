import { parseSSEStream, type SSEEvent } from '@/lib/sse.ts';
import { MigrationFailure } from './errors.ts';
import type { MigrationEventSource, MuxEvent, StreamMessage } from './types.ts';

export interface StreamEventSourceOptions {
  /** `${baseUrl}/system/v1/webhook-events/stream` */
  url: string;
  /** Resolved per connection attempt, so an expiring OAuth token is refreshed. */
  getHeaders(): Promise<Record<string, string>>;
  /** Forces a credential refresh after a 401. Returns false when that is not possible. */
  refreshCredentials(): Promise<boolean>;
  fetch?: typeof fetch;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

function toMuxEvent(sse: SSEEvent): MuxEvent | undefined {
  if (sse.event === 'connected') return undefined;
  let parsed: { id?: unknown; type?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(sse.data);
  } catch {
    return undefined;
  }
  if (typeof parsed?.type !== 'string') return undefined;
  return {
    id: typeof parsed.id === 'string' ? parsed.id : '',
    type: parsed.type,
    data: (parsed.data ?? {}) as Record<string, unknown>,
  };
}

/** A body that ends as soon as the signal aborts, even mid-read. */
function abortable(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const cancel = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        signal.removeEventListener('abort', cancel);
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel,
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** The webhook event stream, reconnecting with backoff like `mux webhooks listen`. */
export function createStreamEventSource(
  options: StreamEventSourceOptions,
): MigrationEventSource {
  const fetchImpl = options.fetch ?? fetch;
  const initialBackoffMs = options.initialBackoffMs ?? 1000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;

  async function connect(
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    let refreshed = false;
    while (true) {
      const response = await fetchImpl(options.url, {
        headers: {
          ...(await options.getHeaders()),
          Accept: 'text/event-stream',
        },
        signal,
      });
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        if (await options.refreshCredentials()) continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new MigrationFailure({
          code: 'STREAM_UNAUTHORIZED',
          message: `The webhook event stream rejected the current credentials (HTTP ${response.status}).`,
          hint: "Run 'mux login' again, or use a token with access to webhook events.",
        });
      }
      if (!response.ok || !response.body) {
        throw new Error(
          `The webhook event stream returned HTTP ${response.status}.`,
        );
      }
      return abortable(response.body, signal);
    }
  }

  async function* messages(
    first: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamMessage> {
    let body: ReadableStream<Uint8Array> | undefined = first;
    let backoffMs = initialBackoffMs;
    while (!signal.aborted) {
      if (!body) {
        try {
          body = await connect(signal);
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof MigrationFailure) throw error;
          await sleep(backoffMs, signal);
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
          continue;
        }
        backoffMs = initialBackoffMs;
        yield { kind: 'reconnected' };
      }
      try {
        for await (const sse of parseSSEStream(body, signal)) {
          const event = toMuxEvent(sse);
          if (event) yield { kind: 'event', event };
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof MigrationFailure) throw error;
      }
      body = undefined;
      await sleep(backoffMs, signal);
    }
  }

  return {
    async open(signal) {
      const first = await connect(signal);
      return messages(first, signal);
    },
  };
}
