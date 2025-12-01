import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	spyOn,
	test,
} from "bun:test";
import { listCommand } from "./list.ts";

describe("mux assets static-renditions list command", () => {
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
			expect(listCommand.getDescription()).toMatch(/static.rendition/i);
		});

		test("requires asset-id argument", () => {
			const args = listCommand.getArguments();
			expect(args.length).toBeGreaterThan(0);
			expect(args[0].name).toBe("asset-id");
		});
	});

	describe("Optional flags", () => {
		test("has --json flag for output formatting", () => {
			const jsonOption = listCommand
				.getOptions()
				.find((opt) => opt.name === "json");
			expect(jsonOption).toBeDefined();
		});
	});

	describe("Input validation", () => {
		test("throws error when asset-id is not provided", async () => {
			try {
				await listCommand.parse([]);
			} catch (_error) {
				// Expected to throw
			}
			expect(exitSpy).toHaveBeenCalled();
		});
	});
});
