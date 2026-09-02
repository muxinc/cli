import { timingSafeEqual } from 'node:crypto';
import { OAuthError } from './oauth.ts';
// Imported as text, so the page lives in a real .html file and gets inlined at
// build time — including into the compiled binary, which has no filesystem to
// read from. Bun's types declare every .html import as its full-stack
// HTMLBundle, ignoring the `type: 'text'` attribute, so the string this actually
// evaluates to has to be asserted.
import callbackTemplateModule from './oauth-callback.html' with {
  type: 'text',
};

const callbackTemplate = callbackTemplateModule as unknown as string;

/**
 * Loopback redirect receiver for the OAuth authorization code flow (RFC 8252).
 *
 * The server binds 127.0.0.1 only — a redirect listener holding an
 * authorization code must not be reachable from off-host — serves exactly one
 * path, accepts exactly one successful callback, and then closes.
 */

/**
 * An OS-assigned ephemeral port is the default, per RFC 8252 section 7.3: the
 * Mux authorization server accepts `http://127.0.0.1:<any port>/callback`, so
 * there is nothing to gain from a fixed port and two things to lose — a
 * collision with whatever else holds that port, and two concurrent logins
 * fighting over it. `--port` remains for cases that need a predictable port,
 * notably SSH port forwarding.
 */
const EPHEMERAL_PORT = [0];

export const CALLBACK_PATH = '/callback';

/** How long to wait for the user to finish authorizing in the browser. */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Grace period between accepting a callback and closing the listener, so the
 * browser receives the complete success page. Callers that finish earlier call
 * `stop()` themselves.
 */
const CLOSE_GRACE_MS = 250;

export interface LoopbackServer {
  /** The bound port. */
  port: number;
  /** The redirect URI to send on the authorization request. */
  redirectUri: string;
  /**
   * Resolve with the authorization code, or reject: state mismatch, provider
   * error, timeout, or cancellation via `stop()`.
   */
  waitForCode(): Promise<string>;
  /** Close the listener. Rejects a still-pending wait as canceled. */
  stop(): void;
}

export interface StartLoopbackOptions {
  /** The `state` value this login attempt expects back. */
  state: string;
  /** Bind this exact port, failing if it is unavailable. */
  port?: number;
  /** Candidate ports to try before falling back to an ephemeral one. */
  ports?: number[];
  timeoutMs?: number;
}

/**
 * Render the browser-facing page from the template in oauth-callback.html.
 *
 * Only literal strings defined in this file are substituted — never anything
 * from the redirect — so there is nothing to escape and no way for a provider
 * response to reach the markup. Keep it that way: if a caller ever needs to show
 * provider text, escape it here first.
 */
function page(title: string, message: string, status = 200): Response {
  // Plain-text markers rather than `{{ }}`: Biome parses this file as HTML, and
  // rejects mustache-style interpolation as a syntax error.
  const html = callbackTemplate
    .replaceAll('__MUX_TITLE__', title)
    .replaceAll('__MUX_MESSAGE__', message);

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Compare state values without leaking length or content through timing. */
function statesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function startLoopbackServer(
  options: StartLoopbackOptions,
): Promise<LoopbackServer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let settle: ((code: string) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  let done = false;

  const codePromise = new Promise<string>((resolve, reject) => {
    settle = (code) => {
      if (done) return;
      done = true;
      resolve(code);
    };
    fail = (error) => {
      if (done) return;
      done = true;
      reject(error);
    };
  });
  // The caller may never call waitForCode() (an early failure elsewhere in
  // login, for example). Attaching a handler here keeps that from surfacing as
  // an unhandled rejection; the original promise still rejects for the caller.
  codePromise.catch(() => {});

  const handle = (request: Request): Response => {
    const url = new URL(request.url);

    if (done) {
      // The login is already settled. A later callback — a refreshed tab, a
      // replayed URL — must not reopen it or change the accepted code.
      return page(
        'Login already completed',
        'This login has already finished. Return to your terminal.',
        410,
      );
    }

    if (url.pathname !== CALLBACK_PATH) {
      return page(
        'Not found',
        'This address is not part of the Mux CLI login.',
        404,
      );
    }

    const state = url.searchParams.get('state') ?? '';
    if (!statesMatch(options.state, state)) {
      fail?.(
        new OAuthError(
          'The login response carried an unexpected state value and was rejected. Run `mux login` again.',
          { terminal: true, code: 'state_mismatch' },
        ),
      );
      return page(
        'Login failed',
        'Unexpected state value. Return to your terminal.',
        400,
      );
    }

    const error = url.searchParams.get('error');
    if (error) {
      const description =
        url.searchParams.get('error_description') ?? undefined;
      fail?.(
        new OAuthError(
          description
            ? `Login was not completed: ${description}`
            : `Login was not completed: ${error}`,
          { terminal: true, code: error },
        ),
      );
      return page('Login failed', 'Return to your terminal for details.');
    }

    const code = url.searchParams.get('code');
    if (!code) {
      fail?.(
        new OAuthError(
          'The login response contained neither an authorization code nor an error.',
          { terminal: true },
        ),
      );
      return page('Login failed', 'Return to your terminal for details.');
    }

    settle?.(code);
    // One successful callback is all a login needs, and a lingering listener is
    // attack surface — but the success page still has to reach the browser, so
    // the close is scheduled rather than immediate. Further callbacks are
    // refused in the meantime (see the `done` check above).
    const closing = setTimeout(() => stop(), CLOSE_GRACE_MS);
    closing.unref?.();
    return page(
      'Login complete',
      'You are signed in to the Mux CLI. Return to your terminal.',
    );
  };

  const server = await bind(options, handle);

  const timer = setTimeout(() => {
    fail?.(
      new OAuthError(
        `Login timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for the browser redirect.`,
        { terminal: true, code: 'timeout' },
      ),
    );
    stop();
  }, timeoutMs);
  // Never hold the process open on the timer alone.
  timer.unref?.();

  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    // Force active connections closed. The success page has already flushed by
    // the time the post-callback close fires (CLOSE_GRACE_MS), and a browser
    // keep-alive connection would otherwise hold the listening socket open —
    // leaving a redirect receiver alive after the login it served.
    server.stop(true);
    fail?.(
      new OAuthError('Login canceled.', { terminal: true, code: 'canceled' }),
    );
  }

  return {
    port: server.port,
    redirectUri: `http://127.0.0.1:${server.port}${CALLBACK_PATH}`,
    waitForCode: () => codePromise,
    stop,
  };
}

interface BoundServer {
  port: number;
  stop(closeActiveConnections: boolean): void;
}

/**
 * Bind the first available candidate port, falling back to an ephemeral port.
 * An explicitly requested port is never substituted — silently moving would
 * break a redirect URI the user configured deliberately.
 */
async function bind(
  options: StartLoopbackOptions,
  handle: (request: Request) => Response,
): Promise<BoundServer> {
  const serve = (port: number): BoundServer => {
    const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: handle });
    if (server.port === undefined) {
      server.stop(true);
      throw new Error('the local login server reported no listening port');
    }
    return { port: server.port, stop: (force) => server.stop(force) };
  };

  if (options.port !== undefined) {
    try {
      return serve(options.port);
    } catch (error) {
      throw new OAuthError(
        `Could not listen on port ${options.port} for the login redirect (${
          error instanceof Error ? error.message : String(error)
        }). Choose another port with --port.`,
        { terminal: true, code: 'port_unavailable' },
      );
    }
  }

  const candidates = options.ports ?? EPHEMERAL_PORT;
  const failures: number[] = [];
  for (const candidate of candidates) {
    try {
      return serve(candidate);
    } catch {
      failures.push(candidate);
    }
  }

  try {
    // Port 0: let the OS pick. Reached when an explicit `ports` list was given
    // and every entry was taken; the default list is already [0].
    return serve(0);
  } catch (error) {
    throw new OAuthError(
      `Could not start the local login server${
        failures.length > 0
          ? ` (ports ${failures.join(', ')} are in use and no ephemeral port was available)`
          : ''
      }: ${
        error instanceof Error ? error.message : String(error)
      }. Free a port or pass --port.`,
      { terminal: true, code: 'port_unavailable' },
    );
  }
}
