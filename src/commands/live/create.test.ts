import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	mock,
	spyOn,
	test,
} from "bun:test";
import type Mux from "@mux/mux-node";
import * as muxModule from "../../lib/mux.ts";
import { createCommand } from "./create.ts";

// Note: These tests focus on CLI flag parsing, command structure, and input validation
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe("mux live create command", () => {
	let exitSpy: Mock<typeof process.exit>;
	let consoleErrorSpy: Mock<typeof console.error>;
	let consoleLogSpy: Mock<typeof console.log>;
	let mockMuxClient: {
		video: {
			liveStreams: {
				create: Mock<
					() => Promise<{
						id: string;
						status: string;
						stream_key: string;
						playback_ids: { id: string; policy: string }[];
					}>
				>;
			};
		};
	};

	beforeEach(() => {
		// Mock process.exit to prevent it from killing the test runner
		exitSpy = spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as never);

		// Spy on console.error and console.log to capture messages
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

		// Mock Mux client
		mockMuxClient = {
			video: {
				liveStreams: {
					create: mock(() =>
						Promise.resolve({
							id: "test-stream-id",
							status: "idle",
							stream_key: "test-stream-key",
							playback_ids: [{ id: "test-playback-id", policy: "public" }],
						}),
					),
				},
			},
		};

		// Mock createAuthenticatedMuxClient
		spyOn(muxModule, "createAuthenticatedMuxClient").mockResolvedValue(
			mockMuxClient as unknown as Mux,
		);
	});

	afterEach(() => {
		exitSpy?.mockRestore();
		consoleErrorSpy?.mockRestore();
		consoleLogSpy?.mockRestore();
	});

	describe("Command metadata", () => {
		test("has correct command description", () => {
			expect(createCommand.getDescription()).toMatch(/create.*live.*stream/i);
		});
	});

	describe("Optional flags", () => {
		test("has --playback-policy flag", () => {
			const playbackPolicyOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "playback-policy");
			expect(playbackPolicyOption).toBeDefined();
		});

		test("has --new-asset-settings flag", () => {
			const newAssetOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "new-asset-settings");
			expect(newAssetOption).toBeDefined();
		});

		test("has --reconnect-window flag", () => {
			const reconnectOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "reconnect-window");
			expect(reconnectOption).toBeDefined();
		});

		test("has --latency-mode flag", () => {
			const latencyOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "latency-mode");
			expect(latencyOption).toBeDefined();
		});

		test("has --test flag", () => {
			const testOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "test");
			expect(testOption).toBeDefined();
		});

		test("has --json flag", () => {
			const jsonOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "json");
			expect(jsonOption).toBeDefined();
		});
	});

	describe("Input validation", () => {
		test("rejects invalid playback policy", async () => {
			try {
				await createCommand.parse(["--playback-policy", "invalid-policy"]);
				expect(true).toBe(false); // Should not reach here
			} catch (_error) {
				// Expected to throw
			}

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorMessage = consoleErrorSpy.mock.calls[0][0];
			expect(errorMessage).toContain("Invalid playback policy");
			expect(errorMessage).toContain("public");
			expect(errorMessage).toContain("signed");
		});

		test("accepts valid playback policy: public", async () => {
			await createCommand.parse(["--playback-policy", "public"]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("accepts valid playback policy: signed", async () => {
			await createCommand.parse(["--playback-policy", "signed"]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("accepts multiple valid playback policies", async () => {
			await createCommand.parse([
				"--playback-policy",
				"public",
				"--playback-policy",
				"signed",
			]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("rejects invalid latency mode", async () => {
			try {
				await createCommand.parse(["--latency-mode", "invalid-mode"]);
				expect(true).toBe(false); // Should not reach here
			} catch (_error) {
				// Expected to throw
			}

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorMessage = consoleErrorSpy.mock.calls[0][0];
			expect(errorMessage).toContain("Invalid latency mode");
			expect(errorMessage).toContain("low");
			expect(errorMessage).toContain("standard");
		});

		test("accepts valid latency mode: low", async () => {
			await createCommand.parse(["--latency-mode", "low"]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("accepts valid latency mode: standard", async () => {
			await createCommand.parse(["--latency-mode", "standard"]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("rejects invalid JSON for new-asset-settings", async () => {
			try {
				await createCommand.parse(["--new-asset-settings", "invalid-json"]);
				expect(true).toBe(false); // Should not reach here
			} catch (_error) {
				// Expected to throw
			}

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorMessage = consoleErrorSpy.mock.calls[0][0];
			expect(errorMessage).toContain("Invalid JSON");
		});

		test("accepts 'none' for new-asset-settings", async () => {
			await createCommand.parse(["--new-asset-settings", "none"]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});

		test("accepts valid JSON for new-asset-settings", async () => {
			await createCommand.parse([
				"--new-asset-settings",
				'{"playback_policies": ["public"]}',
			]);
			expect(mockMuxClient.video.liveStreams.create).toHaveBeenCalled();
		});
	});
});
