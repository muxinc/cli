import Mux from '@mux/ts';

export interface SigningCredentials {
  signingKeyId?: string;
  signingPrivateKey?: string;
}

export interface SigningOptions {
  type?: 'video' | 'thumbnail' | 'gif' | 'storyboard';
  expiration?: string;
  params?: Record<string, unknown>;
}

/**
 * Check if signing credentials are configured
 */
export function hasSigningKeys(credentials: SigningCredentials): boolean {
  return Boolean(credentials.signingKeyId && credentials.signingPrivateKey);
}

/**
 * Sign a playback ID and return the JWT token
 */
export async function signPlaybackId(
  playbackId: string,
  credentials: SigningCredentials,
  /**
   * Optional. Signing is a local operation — the JWT is minted from the signing
   * key pair without calling the API — so no API credential is required. OAuth
   * logins have no token pair to pass.
   */
  apiCredentials: { tokenId?: string; tokenSecret?: string } | undefined,
  options: SigningOptions = {},
): Promise<string> {
  if (!hasSigningKeys(credentials)) {
    throw new Error(
      'Signing keys not configured.\n\n' +
        'To create and configure a signing key, run:\n' +
        '  mux signing-keys create',
    );
  }

  // Explicit nulls rather than undefined: an undefined field lets the SDK read
  // its own environment variables, and this client exists only to mint a JWT.
  const mux = new Mux({
    tokenId: apiCredentials?.tokenId ?? null,
    tokenSecret: apiCredentials?.tokenSecret ?? null,
    authorizationToken: null,
  });

  // The SDK types params as Record<string, string> but the JWT serializer
  // handles nested objects (e.g. custom claims) correctly in practice.
  const signOptions = {
    keyId: credentials.signingKeyId as string,
    keySecret: credentials.signingPrivateKey as string,
    type: options.type ?? 'video',
    expiration: options.expiration ?? '7d',
    ...(options.params ? { params: options.params } : {}),
  };

  const token = (await mux.jwt.signPlaybackId(
    playbackId,
    signOptions as unknown as Parameters<typeof mux.jwt.signPlaybackId>[1],
  )) as string;

  return token;
}
