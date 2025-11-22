import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { getCommand } from "./get.ts";

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe("mux live get command", () => {
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
      expect(getCommand.getDescription()).toMatch(/get.*live.*stream/i);
    });

    test("requires stream-id argument", () => {
      const args = getCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe("stream-id");
    });
  });

  describe("Optional flags", () => {
    test("has --json flag for output formatting", () => {
      const jsonOption = getCommand.getOptions().find((opt) => opt.name === "json");
      expect(jsonOption).toBeDefined();
    });
  });

  describe("Input validation", () => {
    test("throws error when stream-id is not provided", async () => {
      try {
        await getCommand.parse([]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
