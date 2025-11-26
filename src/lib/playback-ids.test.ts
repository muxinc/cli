import { describe, expect, mock, test } from "bun:test";
import {
	createPlaybackId,
	deletePlaybackId,
	type PlaybackIdPolicy,
} from "./playback-ids.ts";

// Mock Mux client for testing
function createMockMuxClient(
	overrides: {
		createResponse?: unknown;
		deleteResponse?: unknown;
		createError?: Error;
		deleteError?: Error;
	} = {},
) {
	return {
		video: {
			assets: {
				createPlaybackId: mock(async (_assetId: string, _params: unknown) => {
					if (overrides.createError) throw overrides.createError;
					return (
						overrides.createResponse ?? {
							id: "playback-id-123",
							policy: "public",
						}
					);
				}),
				deletePlaybackId: mock(
					async (_assetId: string, _playbackId: string) => {
						if (overrides.deleteError) throw overrides.deleteError;
						return overrides.deleteResponse ?? {};
					},
				),
			},
		},
	};
}

describe("createPlaybackId", () => {
	test("creates a public playback ID", async () => {
		const mockClient = createMockMuxClient({
			createResponse: { id: "new-playback-id", policy: "public" },
		});

		const result = await createPlaybackId(
			mockClient as never,
			"asset-123",
			"public",
		);

		expect(result).toEqual({ id: "new-playback-id", policy: "public" });
		expect(mockClient.video.assets.createPlaybackId).toHaveBeenCalledWith(
			"asset-123",
			{ policy: "public" },
		);
	});

	test("creates a signed playback ID", async () => {
		const mockClient = createMockMuxClient({
			createResponse: { id: "signed-playback-id", policy: "signed" },
		});

		const result = await createPlaybackId(
			mockClient as never,
			"asset-456",
			"signed",
		);

		expect(result).toEqual({ id: "signed-playback-id", policy: "signed" });
		expect(mockClient.video.assets.createPlaybackId).toHaveBeenCalledWith(
			"asset-456",
			{ policy: "signed" },
		);
	});

	test("throws error when API call fails", async () => {
		const mockClient = createMockMuxClient({
			createError: new Error("Asset not found"),
		});

		await expect(
			createPlaybackId(mockClient as never, "invalid-asset", "public"),
		).rejects.toThrow("Asset not found");
	});
});

describe("deletePlaybackId", () => {
	test("deletes a playback ID successfully", async () => {
		const mockClient = createMockMuxClient();

		await deletePlaybackId(mockClient as never, "asset-123", "playback-456");

		expect(mockClient.video.assets.deletePlaybackId).toHaveBeenCalledWith(
			"asset-123",
			"playback-456",
		);
	});

	test("throws error when API call fails", async () => {
		const mockClient = createMockMuxClient({
			deleteError: new Error("Playback ID not found"),
		});

		await expect(
			deletePlaybackId(mockClient as never, "asset-123", "invalid-playback"),
		).rejects.toThrow("Playback ID not found");
	});
});

describe("PlaybackIdPolicy type", () => {
	test("accepts valid policy values", () => {
		const publicPolicy: PlaybackIdPolicy = "public";
		const signedPolicy: PlaybackIdPolicy = "signed";

		expect(publicPolicy).toBe("public");
		expect(signedPolicy).toBe("signed");
	});
});
