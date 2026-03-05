import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getDataDir } from './xdg.ts';

function getSigningSecretPath(): string {
  return join(getDataDir(), 'webhook-signing-secret');
}

/**
 * Get or create a persistent webhook signing secret.
 * The secret is stored in the data directory and reused across sessions
 * so users don't have to reconfigure their local dev server each time.
 */
export async function getSigningSecret(): Promise<string> {
  const path = getSigningSecretPath();

  if (existsSync(path)) {
    const secret = (await readFile(path, 'utf-8')).trim();
    if (secret) return secret;
  }

  const secret = randomBytes(16).toString('hex');
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  await writeFile(path, secret, { mode: 0o600 });
  return secret;
}

/**
 * Sign a webhook payload using the same scheme as Mux webhooks.
 * Produces a `mux-signature` header value: `t=<timestamp>,v1=<signature>`
 */
export function signPayload(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Build headers for a signed webhook forward request.
 */
export function buildSignedHeaders(
  body: string,
  secret: string,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'mux-signature': signPayload(body, secret),
  };
}
