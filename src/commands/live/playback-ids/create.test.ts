import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	spyOn,
	test,
} from "bun:test";
import { createCommand } from "./create.ts";

describe("mux live playback-ids create command", () => {
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
			expect(createCommand.getDescription()).toMatch(/create.*playback/i);
		});

		test("requires live-stream-id argument", () => {
			const args = createCommand.getArguments();
			expect(args.length).toBeGreaterThan(0);
			expect(args[0].name).toBe("live-stream-id");
		});
	});

	describe("Optional flags", () => {
		test("has --policy flag for specifying public or signed", () => {
			const policyOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "policy");
			expect(policyOption).toBeDefined();
		});

		test("has --json flag for output formatting", () => {
			const jsonOption = createCommand
				.getOptions()
				.find((opt) => opt.name === "json");
			expect(jsonOption).toBeDefined();
		});
	});

	describe("Input validation", () => {
		test("throws error when live-stream-id is not provided", async () => {
			try {
				await createCommand.parse([]);
			} catch (_error) {
				// Expected to throw
			}
			expect(exitSpy).toHaveBeenCalled();
		});
	});
});
