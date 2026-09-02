import { AbstractPage } from '@mux/ts/core/pagination';

/**
 * SDK page objects carry internal request state (options, response, body)
 * as enumerable properties, so stringifying one leaks those fields and
 * duplicates the payload. Unwrap to the raw API response body instead.
 */
export function unwrapPage(value: unknown): unknown {
  if (value instanceof AbstractPage) {
    return (value as unknown as { body: unknown }).body;
  }
  return value;
}

/**
 * Serialize an API response for --json output.
 */
export function formatJson(value: unknown): string {
  return JSON.stringify(unwrapPage(value), null, 2);
}
