import type { MigrationEventSource } from './types.ts';

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

/** The webhook event stream, reconnecting with backoff like `mux webhooks listen`. */
export function createStreamEventSource(
  _options: StreamEventSourceOptions,
): MigrationEventSource {
  throw new Error('Not implemented');
}
