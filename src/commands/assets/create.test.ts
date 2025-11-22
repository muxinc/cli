import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createCommand } from "./create.ts";

// Note: These tests focus on CLI flag parsing and input validation
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe("mux assets create command", () => {
  let tempDir: string;
  let exitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mux-cli-test-"));

    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    // Spy on console.error to capture error messages
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe("Flag combinations and validation", () => {
    test("throws error when both --url and --upload are provided", async () => {
      // Create a test file
      const testFile = join(tempDir, "test.mp4");
      await writeFile(testFile, "fake video content");

      try {
        await createCommand.parse([
          "--url",
          "https://example.com/video.mp4",
          "--upload",
          testFile,
        ]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test("throws error when both --file and --url are provided", async () => {
      // Create a config file
      const configFile = join(tempDir, "config.json");
      await writeFile(configFile, JSON.stringify({ input: [{ url: "https://example.com/video.mp4" }] }));

      try {
        await createCommand.parse([
          "--url",
          "https://example.com/video.mp4",
          "--file",
          configFile,
        ]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test("throws error when both --upload and --file are provided", async () => {
      // Create test files
      const testFile = join(tempDir, "test.mp4");
      await writeFile(testFile, "fake video content");
      const configFile = join(tempDir, "config.json");
      await writeFile(configFile, JSON.stringify({ input: [{ url: "https://example.com/video.mp4" }] }));

      try {
        await createCommand.parse([
          "--upload",
          testFile,
          "--file",
          configFile,
        ]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test("throws error when no input method is provided", async () => {
      try {
        await createCommand.parse(["--test"]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Must provide one input method/i);
    });

    test("accepts multiple --playback-policy flags", async () => {
      // This test verifies that Cliffy correctly collects multiple values
      // We're testing the flag parsing, not the API call
      const command = createCommand;
      const playbackPolicyOption = command.getOptions().find(
        (opt) => opt.name === "playback-policy"
      );

      expect(playbackPolicyOption).toBeDefined();
      expect(playbackPolicyOption?.collect).toBe(true);
    });
  });

  describe("JSON config file mode", () => {
    test("throws error when config file does not exist", async () => {
      const configPath = join(tempDir, "nonexistent.json");

      try {
        await createCommand.parse(["--file", configPath]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/file not found/i);
    });

    test("throws error when config file is invalid JSON", async () => {
      const configFile = join(tempDir, "invalid.json");
      await writeFile(configFile, "{ this is not valid JSON }");

      try {
        await createCommand.parse(["--file", configFile]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Invalid JSON/i);
    });
  });

  describe("File upload mode", () => {
    test("throws error when no files match glob pattern", async () => {
      const pattern = join(tempDir, "*.nonexistent");

      try {
        await createCommand.parse(["--upload", pattern, "-y"]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/No files found matching pattern/i);
    });

    test("throws error when file does not exist", async () => {
      const nonexistentFile = join(tempDir, "nonexistent.mp4");

      try {
        await createCommand.parse(["--upload", nonexistentFile, "-y"]);
      } catch (error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/No files found matching pattern/i);
    });
  });

  describe("Output formatting flags", () => {
    test("has --json flag option", () => {
      const jsonOption = createCommand.getOptions().find((opt) => opt.name === "json");
      expect(jsonOption).toBeDefined();
    });

    test("has -y/--yes flag option", () => {
      const yesOption = createCommand.getOptions().find((opt) => opt.name === "yes");
      expect(yesOption).toBeDefined();
    });
  });

  describe("Optional flags", () => {
    test("has --test flag for creating test assets", () => {
      const testOption = createCommand.getOptions().find((opt) => opt.name === "test");
      expect(testOption).toBeDefined();
    });

    test("has --passthrough flag for user metadata", () => {
      const passthroughOption = createCommand.getOptions().find(
        (opt) => opt.name === "passthrough"
      );
      expect(passthroughOption).toBeDefined();
    });

    test("has --mp4-support flag", () => {
      const mp4Option = createCommand.getOptions().find((opt) => opt.name === "mp4-support");
      expect(mp4Option).toBeDefined();
    });

    test("has --encoding-tier flag", () => {
      const encodingOption = createCommand.getOptions().find(
        (opt) => opt.name === "encoding-tier"
      );
      expect(encodingOption).toBeDefined();
    });

    test("has --normalize-audio flag", () => {
      const normalizeOption = createCommand.getOptions().find(
        (opt) => opt.name === "normalize-audio"
      );
      expect(normalizeOption).toBeDefined();
    });

    test("has --wait flag", () => {
      const waitOption = createCommand.getOptions().find((opt) => opt.name === "wait");
      expect(waitOption).toBeDefined();
    });
  });

  describe("Command metadata", () => {
    test("has correct command description", () => {
      expect(createCommand.getDescription()).toBe("Create a new Mux video asset");
    });

    test("has all three input method options", () => {
      const options = createCommand.getOptions();
      const urlOption = options.find((opt) => opt.name === "url");
      const uploadOption = options.find((opt) => opt.name === "upload");
      const fileOption = options.find((opt) => opt.name === "file");

      expect(urlOption).toBeDefined();
      expect(uploadOption).toBeDefined();
      expect(fileOption).toBeDefined();
    });
  });
});
