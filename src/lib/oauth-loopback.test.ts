import { describe, expect, it } from 'bun:test';
import { startLoopbackServer } from './oauth-loopback.ts';

const STATE = 'test-state-value';

/**
 * Start a server on an OS-assigned port. Tests must not share the default
 * candidate port: a browser keep-alive connection can hold a just-stopped
 * listener open, and a second server on the same port would then split traffic
 * with it.
 */
function startTestServer(
  options: Partial<Parameters<typeof startLoopbackServer>[0]> = {},
) {
  return startLoopbackServer({ state: STATE, ports: [0], ...options });
}

/** Fetch the callback path on the server's own port. */
function callback(port: number, query: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/callback?${query}`);
}

describe('startLoopbackServer', () => {
  it('exposes a loopback redirect URI on the bound port', async () => {
    const server = await startTestServer();
    try {
      expect(server.redirectUri).toBe(
        `http://127.0.0.1:${server.port}/callback`,
      );
      expect(server.port).toBeGreaterThan(0);
    } finally {
      server.stop();
    }
  });

  it('resolves with the authorization code when state matches', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      const response = await callback(
        server.port,
        `code=auth_code_123&state=${STATE}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await waiting).toBe('auth_code_123');
    } finally {
      server.stop();
    }
  });

  it('does not leak the authorization code into the success page', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      const response = await callback(
        server.port,
        `code=secret_code_abc&state=${STATE}`,
      );
      const body = await response.text();
      await waiting;

      expect(body).not.toContain('secret_code_abc');
    } finally {
      server.stop();
    }
  });

  it('serves a self-contained page with no external requests', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      const body = await (
        await callback(server.port, `code=c&state=${STATE}`)
      ).text();
      await waiting;

      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toContain('<script');
    } finally {
      server.stop();
    }
  });

  it('renders the page template with no placeholders left behind', async () => {
    // Guards against a renamed placeholder silently shipping `{{title}}` to a
    // user's browser.
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      const body = await (
        await callback(server.port, `code=c&state=${STATE}`)
      ).text();
      await waiting;

      expect(body).toContain('Login complete');
      expect(body).toContain('Return to your terminal');
      expect(body).not.toContain('{{');
    } finally {
      server.stop();
    }
  });

  it('rejects without resolving a code when state does not match', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      const response = await callback(
        server.port,
        'code=auth_code_123&state=wrong-state',
      );

      expect(response.status).toBe(400);
      await expect(waiting).rejects.toThrow(/state/i);
    } finally {
      server.stop();
    }
  });

  it('rejects when the provider returns an error instead of a code', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      await callback(
        server.port,
        `error=access_denied&error_description=User%20said%20no&state=${STATE}`,
      );

      await expect(waiting).rejects.toThrow(/User said no/);
    } finally {
      server.stop();
    }
  });

  it('rejects when the callback carries neither a code nor an error', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      await callback(server.port, `state=${STATE}`);

      await expect(waiting).rejects.toThrow();
    } finally {
      server.stop();
    }
  });

  it('returns 404 for any path other than the callback', async () => {
    const server = await startTestServer();
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/`);

      expect(response.status).toBe(404);
    } finally {
      server.stop();
    }
  });

  it('ignores a second callback after the first has been accepted', async () => {
    const server = await startTestServer();
    try {
      const waiting = server.waitForCode();
      await callback(server.port, `code=first&state=${STATE}`);
      expect(await waiting).toBe('first');

      // A replayed or refreshed callback is refused and cannot change the
      // accepted code.
      const second = await callback(
        server.port,
        `code=second&state=${STATE}`,
      ).catch(() => null);
      if (second) {
        expect(second.status).toBe(410);
      }
      expect(await waiting).toBe('first');
    } finally {
      server.stop();
    }
  });

  it('rejects when no callback arrives before the timeout', async () => {
    const server = await startTestServer({ timeoutMs: 50 });
    try {
      await expect(server.waitForCode()).rejects.toThrow(/timed out|timeout/i);
    } finally {
      server.stop();
    }
  });

  it('defaults to an OS-assigned port, so concurrent logins never collide', async () => {
    // No `ports` override here: this exercises the real default.
    const first = await startLoopbackServer({ state: STATE });
    const second = await startLoopbackServer({ state: STATE });
    try {
      expect(first.port).toBeGreaterThan(0);
      expect(second.port).toBeGreaterThan(0);
      expect(second.port).not.toBe(first.port);
    } finally {
      first.stop();
      second.stop();
    }
  });

  it('binds the requested port when one is given', async () => {
    const probe = await startTestServer();
    const port = probe.port;
    probe.stop();

    const server = await startLoopbackServer({ state: STATE, port });
    try {
      expect(server.port).toBe(port);
    } finally {
      server.stop();
    }
  });

  it('frees the port on stop so it can be rebound', async () => {
    const first = await startTestServer();
    const port = first.port;
    first.stop();

    const second = await startLoopbackServer({ state: STATE, port });
    try {
      expect(second.port).toBe(port);
    } finally {
      second.stop();
    }
  });

  it('falls back to another port when the preferred candidates are taken', async () => {
    const blocker = await startTestServer();
    try {
      const server = await startLoopbackServer({
        state: STATE,
        ports: [blocker.port],
      });
      try {
        expect(server.port).not.toBe(blocker.port);
        expect(server.port).toBeGreaterThan(0);
      } finally {
        server.stop();
      }
    } finally {
      blocker.stop();
    }
  });

  it('fails loudly when an explicitly requested port is unavailable', async () => {
    const blocker = await startTestServer();
    try {
      await expect(
        startLoopbackServer({ state: STATE, port: blocker.port }),
      ).rejects.toThrow(/port/i);
    } finally {
      blocker.stop();
    }
  });

  it('rejects the pending wait when the server is stopped (cancellation)', async () => {
    const server = await startTestServer();
    const waiting = server.waitForCode();
    server.stop();

    await expect(waiting).rejects.toThrow(/cancel/i);
  });
});
