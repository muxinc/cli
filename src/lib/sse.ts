export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Async generator that parses a ReadableStream as Server-Sent Events.
 * Handles chunked delivery, multi-line data fields, and heartbeat comments.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData: string[] = [];

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      // Keep the last element as it may be an incomplete line
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith(':')) {
          // Comment / heartbeat — skip
          continue;
        }

        if (line === '') {
          // Empty line = event boundary
          if (currentData.length > 0) {
            yield {
              event: currentEvent || 'message',
              data: currentData.join('\n'),
            };
          }
          currentEvent = '';
          currentData = [];
          continue;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const field = line.slice(0, colonIndex);
        // Value starts after ": " (space after colon is optional per spec)
        const value = line.slice(colonIndex + 1).replace(/^ /, '');

        if (field === 'event') {
          currentEvent = value;
        } else if (field === 'data') {
          currentData.push(value);
        }
      }
    }

    // Flush any remaining event in buffer
    if (buffer !== '') {
      const colonIndex = buffer.indexOf(':');
      if (colonIndex !== -1) {
        const field = buffer.slice(0, colonIndex);
        const value = buffer.slice(colonIndex + 1).replace(/^ /, '');
        if (field === 'data') {
          currentData.push(value);
        } else if (field === 'event') {
          currentEvent = value;
        }
      }
    }
    if (currentData.length > 0) {
      yield {
        event: currentEvent || 'message',
        data: currentData.join('\n'),
      };
    }
  } finally {
    reader.releaseLock();
  }
}
