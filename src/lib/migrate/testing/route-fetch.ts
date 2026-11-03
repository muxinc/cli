export type RouteHandler = (
  url: URL,
  init: RequestInit | undefined,
) => Response | unknown | Promise<Response | unknown>;

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

/**
 * A fetch that serves recorded provider responses by `METHOD /path`. A handler
 * may return a Response, or any value to send as a 200 JSON body. Requests
 * with no matching route fail the test.
 */
export function routeFetch(routes: Record<string, RouteHandler>) {
  const requests: RecordedRequest[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const handler =
      routes[`${method} ${url.pathname}`] ??
      routes[`${method} ${url.host}${url.pathname}`];
    if (!handler) throw new Error(`No recorded response for ${method} ${url}`);
    const result = await handler(url, init);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

export const noSleep = async () => {};
