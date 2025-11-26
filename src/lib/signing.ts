import Mux from "@mux/mux-node";

export interface SigningCredentials {
	signingKeyId?: string;
	signingPrivateKey?: string;
}

export interface SigningOptions {
	type?: "video" | "thumbnail" | "gif" | "storyboard";
	expiration?: string;
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
	apiCredentials: { tokenId: string; tokenSecret: string },
	options: SigningOptions = {},
): Promise<string> {
	if (!hasSigningKeys(credentials)) {
		throw new Error(
			"Signing keys not configured.\n\n" +
				"To create and configure a signing key, run:\n" +
				"  mux signing-keys create",
		);
	}

	const mux = new Mux({
		tokenId: apiCredentials.tokenId,
		tokenSecret: apiCredentials.tokenSecret,
	});

	const token = await mux.jwt.signPlaybackId(playbackId, {
		keyId: credentials.signingKeyId as string,
		keySecret: credentials.signingPrivateKey as string,
		type: options.type ?? "video",
		expiration: options.expiration ?? "7d",
	});

	return token;
}
