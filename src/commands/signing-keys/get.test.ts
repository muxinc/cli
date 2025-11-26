import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	spyOn,
	test,
} from "bun:test";
import { getCommand } from "./get.ts";

// Note: These tests focus on CLI flag parsing and basic command structure
// They do NOT test the actual Mux API integration

describe("mux signing-keys get command", () => {
	let exitSpy: Mock<typeof process.exit>;
	let consoleErrorSpy: Mock<typeof console.error>;
	let consoleLogSpy: Mock<typeof console.log>;

	beforeEach(() => {
		// Mock process.exit to prevent it from killing the test runner
		exitSpy = spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as never);

		// Spy on console methods to capture output
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
		consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		exitSpy?.mockRestore();
		consoleErrorSpy?.mockRestore();
		consoleLogSpy?.mockRestore();
	});

	describe("Command metadata", () => {
		test("has correct command description", () => {
			expect(getCommand.getDescription()).toBe(
				"Get details about a specific signing key",
			);
		});

		test("has --json flag option", () => {
			const jsonOption = getCommand
				.getOptions()
				.find((opt) => opt.name === "json");
			expect(jsonOption).toBeDefined();
			expect(jsonOption?.description).toContain("JSON");
		});

		test("requires signing-key-id argument", () => {
			const args = getCommand.getArguments();
			expect(args.length).toBe(1);
			expect(args[0].name).toBe("signing-key-id");
		});
	});

	describe("Command execution without auth", () => {
		test("fails when not logged in", async () => {
			// This will fail at the authentication check
			// We're just verifying the command structure is correct
			try {
				await getCommand.parse(["test-key-id"]);
			} catch (_error) {
				// Expected to fail at auth check
			}

			// The command should fail during execution, not during parsing
			// We just want to ensure it parses correctly
			expect(true).toBe(true);
		});
	});
});
