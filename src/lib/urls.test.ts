import { describe, expect, test } from "bun:test";
import { getPlayerUrl, getStreamUrl } from "./urls.ts";

describe("getStreamUrl", () => {
	test("returns HLS URL for playback ID", () => {
		const url = getStreamUrl("abc123");
		expect(url).toBe("https://stream.mux.com/abc123.m3u8");
	});

	test("appends token as query param when provided", () => {
		const url = getStreamUrl("abc123", "my-jwt-token");
		expect(url).toBe("https://stream.mux.com/abc123.m3u8?token=my-jwt-token");
	});

	test("handles playback IDs with special characters", () => {
		const url = getStreamUrl("abc-123_xyz");
		expect(url).toBe("https://stream.mux.com/abc-123_xyz.m3u8");
	});
});

describe("getPlayerUrl", () => {
	test("returns player URL for playback ID", () => {
		const url = getPlayerUrl("abc123");
		expect(url).toBe("https://player.mux.com/abc123");
	});

	test("appends playback-token as query param when provided", () => {
		const url = getPlayerUrl("abc123", "my-jwt-token");
		expect(url).toBe(
			"https://player.mux.com/abc123?playback-token=my-jwt-token",
		);
	});

	test("handles playback IDs with special characters", () => {
		const url = getPlayerUrl("abc-123_xyz");
		expect(url).toBe("https://player.mux.com/abc-123_xyz");
	});
});
