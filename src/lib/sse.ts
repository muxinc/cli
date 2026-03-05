export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Split a string into lines per the WHATWG SSE spec.
 * Valid line endings: \r\n, \r, \n
 */
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/**
 * Process a single SSE line, updating event/data state.
 * Returns an SSEEvent to yield if the line is an event boundary, or undefined.
 */
function processLine(
  line: string,
  state: { event: string; data: string[] },
): SSEEvent | undefined {
  // Empty line = event boundary
  if (line === '') {
    if (state.data.length > 0) {
      const event: SSEEvent = {
        event: state.event || 'message',
        data: state.data.join('\n'),
      };
      state.event = '';
      state.data = [];
      return event;
    }
    state.event = '';
    state.data = [];
    return undefined;
  }

  // Comment / heartbeat — skip
  if (line.startsWith(':')) {
    return undefined;
  }

  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return undefined;

  const field = line.slice(0, colonIndex);
  // Value starts after ": " (space after colon is optional per spec)
  const value = line.slice(colonIndex + 1).replace(/^ /, '');

  if (field === 'event') {
    state.event = value;
  } else if (field === 'data') {
    state.data.push(value);
  }

  return undefined;
}

/**
 * Async generator that parses a ReadableStream as Server-Sent Events.
 * Conforms to the WHATWG SSE spec: handles \r\n, \r, and \n line endings,
 * chunked delivery, multi-line data fields, and heartbeat comments.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const state = { event: '', data: [] as string[] };

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = splitLines(buffer);
      // Keep the last element as it may be an incomplete line
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = processLine(line, state);
        if (event) yield event;
      }
    }

    // Flush any remaining event in buffer
    if (buffer !== '') {
      processLine(buffer, state);
    }
    const finalEvent = processLine('', state);
    if (finalEvent) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}
