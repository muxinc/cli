import { describe, expect, test } from "bun:test";
import { hasSigningKeys, type SigningCredentials } from "./signing.ts";

describe("hasSigningKeys", () => {
	test("returns true when both signingKeyId and signingPrivateKey are present", () => {
		const credentials: SigningCredentials = {
			signingKeyId: "key-123",
			signingPrivateKey: "private-key-base64",
		};
		expect(hasSigningKeys(credentials)).toBe(true);
	});

	test("returns false when signingKeyId is missing", () => {
		const credentials: SigningCredentials = {
			signingKeyId: undefined,
			signingPrivateKey: "private-key-base64",
		};
		expect(hasSigningKeys(credentials)).toBe(false);
	});

	test("returns false when signingPrivateKey is missing", () => {
		const credentials: SigningCredentials = {
			signingKeyId: "key-123",
			signingPrivateKey: undefined,
		};
		expect(hasSigningKeys(credentials)).toBe(false);
	});

	test("returns false when both are missing", () => {
		const credentials: SigningCredentials = {
			signingKeyId: undefined,
			signingPrivateKey: undefined,
		};
		expect(hasSigningKeys(credentials)).toBe(false);
	});

	test("returns false when credentials are empty strings", () => {
		const credentials: SigningCredentials = {
			signingKeyId: "",
			signingPrivateKey: "",
		};
		expect(hasSigningKeys(credentials)).toBe(false);
	});
});

// Note: signPlaybackId tests would require mocking the Mux SDK
// which involves actual JWT signing. We'll test that through
// integration tests or by testing the sign command directly.
