import { describe, test, expect } from "bun:test";
import { listCommand } from "./list.ts";

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe("mux live list command", () => {
  describe("Command metadata", () => {
    test("has correct command description", () => {
      expect(listCommand.getDescription()).toMatch(/list.*live.*stream/i);
    });
  });

  describe("Optional flags", () => {
    test("has --limit flag for pagination", () => {
      const limitOption = listCommand.getOptions().find((opt) => opt.name === "limit");
      expect(limitOption).toBeDefined();
    });

    test("has --page flag for pagination", () => {
      const pageOption = listCommand.getOptions().find((opt) => opt.name === "page");
      expect(pageOption).toBeDefined();
    });

    test("has --json flag for output formatting", () => {
      const jsonOption = listCommand.getOptions().find((opt) => opt.name === "json");
      expect(jsonOption).toBeDefined();
    });
  });
});
