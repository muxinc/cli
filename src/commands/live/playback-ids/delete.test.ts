import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	spyOn,
	test,
} from "bun:test";
import { deleteCommand } from "./delete.ts";

describe("mux live playback-ids delete command", () => {
	let exitSpy: Mock<typeof process.exit>;
	let consoleErrorSpy: Mock<typeof console.error>;

	beforeEach(() => {
		exitSpy = spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as never);
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		exitSpy?.mockRestore();
		consoleErrorSpy?.mockRestore();
	});

	describe("Command metadata", () => {
		test("has correct command description", () => {
			expect(deleteCommand.getDescription()).toMatch(/delete.*playback/i);
		});

		test("requires live-stream-id argument", () => {
			const args = deleteCommand.getArguments();
			expect(args.length).toBeGreaterThan(0);
			expect(args[0].name).toBe("live-stream-id");
		});

		test("requires playback-id argument", () => {
			const args = deleteCommand.getArguments();
			expect(args.length).toBeGreaterThan(1);
			expect(args[1].name).toBe("playback-id");
		});
	});

	describe("Optional flags", () => {
		test("has --force flag to skip confirmation", () => {
			const forceOption = deleteCommand
				.getOptions()
				.find((opt) => opt.name === "force");
			expect(forceOption).toBeDefined();
		});

		test("has --json flag for output formatting", () => {
			const jsonOption = deleteCommand
				.getOptions()
				.find((opt) => opt.name === "json");
			expect(jsonOption).toBeDefined();
		});
	});

	describe("Input validation", () => {
		test("throws error when live-stream-id is not provided", async () => {
			try {
				await deleteCommand.parse([]);
			} catch (_error) {
				// Expected to throw
			}
			expect(exitSpy).toHaveBeenCalled();
		});

		test("throws error when playback-id is not provided", async () => {
			try {
				await deleteCommand.parse(["live-stream-123"]);
			} catch (_error) {
				// Expected to throw
			}
			expect(exitSpy).toHaveBeenCalled();
		});
	});
});
