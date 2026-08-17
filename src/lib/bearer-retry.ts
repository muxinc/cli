/**
 * A `fetch` wrapper that refreshes an OAuth access token once on a 401 and
 * retries the request.
 *
 * Proactive refresh (see token-refresh.ts) covers expiry, but a token can be
 * invalidated server-side while the CLI still considers it fresh. Handing this
 * to the Mux SDK as its `fetch` implementation makes every command reactive to
 * that without any command knowing about tokens.
 */
export interface BearerRetryOptions {
  /** Obtain a new access token. Returns the token to retry with. */
  refresh: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

/** Rebuild request arguments with a replaced Authorization header. */
function withBearer(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  accessToken: string,
): [Parameters<typeof fetch>[0], RequestInit | undefined] {
  if (input instanceof Request && !init) {
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return [new Request(input, { headers }), undefined];
  }

  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set('Authorization', `Bearer ${accessToken}`);
  return [input, { ...init, headers }];
}

export function createBearerRetryFetch(
  options: BearerRetryOptions,
): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch;

  return (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await fetchImpl(input, init);
    if (response.status !== 401) {
      return response;
    }

    let accessToken: string;
    try {
      accessToken = await options.refresh();
    } catch {
      // Surface the original 401 rather than a refresh error raised from inside
      // an unrelated API call: the caller's 401 handling is the useful message.
      return response;
    }

    const [retryInput, retryInit] = withBearer(input, init, accessToken);
    return fetchImpl(retryInput, retryInit);
  }) as typeof fetch;
}
