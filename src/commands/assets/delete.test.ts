import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { deleteCommand } from "./delete.ts";

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe("mux assets delete command", () => {
  let exitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    // Spy on console.error to capture error messages
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe("Command metadata", () => {
    test("has correct command description", () => {
      expect(deleteCommand.getDescription()).toMatch(/delete.*asset/i);
    });

    test("requires asset-id argument", () => {
      const args = deleteCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe("asset-id");
    });
  });

  describe("Optional flags", () => {
    test("has --force flag to skip confirmation", () => {
      const forceOption = deleteCommand.getOptions().find((opt) => opt.name === "force");
      expect(forceOption).toBeDefined();
    });

    test("has --json flag for output formatting", () => {
      const jsonOption = deleteCommand.getOptions().find((opt) => opt.name === "json");
      expect(jsonOption).toBeDefined();
    });
  });

  describe("Input validation", () => {
    test("throws error when asset-id is not provided", async () => {
      try {
        await deleteCommand.parse([]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
