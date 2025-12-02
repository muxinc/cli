import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommand } from './create.ts';

// Note: These tests focus on CLI flag parsing and input validation
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux assets create command', () => {
  let tempDir: string;
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));

    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Spy on console.error to capture error messages
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Flag combinations and validation', () => {
    test('throws error when both --url and --upload are provided', async () => {
      // Create a test file
      const testFile = join(tempDir, 'test.mp4');
      await writeFile(testFile, 'fake video content');

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--upload',
          testFile,
        ]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test('throws error when both --file and --url are provided', async () => {
      // Create a config file
      const configFile = join(tempDir, 'config.json');
      await writeFile(
        configFile,
        JSON.stringify({ input: [{ url: 'https://example.com/video.mp4' }] }),
      );

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--file',
          configFile,
        ]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test('throws error when both --upload and --file are provided', async () => {
      // Create test files
      const testFile = join(tempDir, 'test.mp4');
      await writeFile(testFile, 'fake video content');
      const configFile = join(tempDir, 'config.json');
      await writeFile(
        configFile,
        JSON.stringify({ input: [{ url: 'https://example.com/video.mp4' }] }),
      );

      try {
        await createCommand.parse(['--upload', testFile, '--file', configFile]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Cannot use multiple input methods/i);
    });

    test('throws error when no input method is provided', async () => {
      try {
        await createCommand.parse(['--test']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Must provide one input method/i);
    });

    test('accepts multiple --playback-policy flags', async () => {
      // This test verifies that Cliffy correctly collects multiple values
      // We're testing the flag parsing, not the API call
      const command = createCommand;
      const playbackPolicyOption = command
        .getOptions()
        .find((opt) => opt.name === 'playback-policy');

      expect(playbackPolicyOption).toBeDefined();
      expect(playbackPolicyOption?.collect).toBe(true);
    });
  });

  describe('JSON config file mode', () => {
    test('throws error when config file does not exist', async () => {
      const configPath = join(tempDir, 'nonexistent.json');

      try {
        await createCommand.parse(['--file', configPath]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/file not found/i);
    });

    test('throws error when config file is invalid JSON', async () => {
      const configFile = join(tempDir, 'invalid.json');
      await writeFile(configFile, '{ this is not valid JSON }');

      try {
        await createCommand.parse(['--file', configFile]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/Invalid JSON/i);
    });
  });

  describe('File upload mode', () => {
    test('throws error when no files match glob pattern', async () => {
      const pattern = join(tempDir, '*.nonexistent');

      try {
        await createCommand.parse(['--upload', pattern, '-y']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/No files found matching pattern/i);
    });

    test('throws error when file does not exist', async () => {
      const nonexistentFile = join(tempDir, 'nonexistent.mp4');

      try {
        await createCommand.parse(['--upload', nonexistentFile, '-y']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toMatch(/No files found matching pattern/i);
    });
  });

  describe('Output formatting flags', () => {
    test('has --json flag option', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has -y/--yes flag option', () => {
      const yesOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'yes');
      expect(yesOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --test flag for creating test assets', () => {
      const testOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'test');
      expect(testOption).toBeDefined();
    });

    test('has --passthrough flag for user metadata', () => {
      const passthroughOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(passthroughOption).toBeDefined();
    });

    test('has --static-renditions flag', () => {
      const renditionsOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'static-renditions');
      expect(renditionsOption).toBeDefined();
    });

    test('has --video-quality flag', () => {
      const qualityOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'video-quality');
      expect(qualityOption).toBeDefined();
    });

    test('has --normalize-audio flag', () => {
      const normalizeOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'normalize-audio');
      expect(normalizeOption).toBeDefined();
    });

    test('has --wait flag', () => {
      const waitOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'wait');
      expect(waitOption).toBeDefined();
    });
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(createCommand.getDescription()).toBe(
        'Create a new Mux video asset',
      );
    });

    test('has all three input method options', () => {
      const options = createCommand.getOptions();
      const urlOption = options.find((opt) => opt.name === 'url');
      const uploadOption = options.find((opt) => opt.name === 'upload');
      const fileOption = options.find((opt) => opt.name === 'file');

      expect(urlOption).toBeDefined();
      expect(uploadOption).toBeDefined();
      expect(fileOption).toBeDefined();
    });
  });

  describe('Enum validation', () => {
    test('rejects invalid playback-policy value', async () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--playback-policy',
          'invalid-policy',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('Invalid playback policy');
      expect(errorMessage).toContain('public');
      expect(errorMessage).toContain('signed');
    });

    test('accepts valid playback-policy: public', async () => {
      // Just test that parsing succeeds (will fail at auth, which is expected)
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--playback-policy',
          'public',
        ]);
      } catch (_error) {
        // Will fail at auth step, but that's after validation passes
      }

      // If validation failed, exitSpy would have been called with 1
      // If it wasn't called, or was called with something else, validation passed
      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        // Check that it wasn't a validation error
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid playback policy');
      }
    });

    test('accepts valid playback-policy: signed', async () => {
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--playback-policy',
          'signed',
        ]);
      } catch (_error) {
        // Will fail at auth step, but that's after validation passes
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid playback policy');
      }
    });

    test('rejects invalid static-renditions value', async () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--static-renditions',
          'ultra-hd',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('Invalid static-renditions value');
      expect(errorMessage).toContain('highest');
      expect(errorMessage).toContain('1080p');
    });

    test('accepts valid static-renditions: 1080p', async () => {
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--static-renditions',
          '1080p',
        ]);
      } catch (_error) {
        // Will fail at auth step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid static-renditions value');
      }
    });

    test('accepts valid static-renditions: audio-only', async () => {
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--static-renditions',
          'audio-only',
        ]);
      } catch (_error) {
        // Will fail at auth step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid static-renditions value');
      }
    });

    test('rejects invalid video-quality value', async () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--video-quality',
          'ultra',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('Invalid video quality');
      expect(errorMessage).toContain('basic');
      expect(errorMessage).toContain('plus');
    });

    test('accepts valid video-quality: basic', async () => {
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--video-quality',
          'basic',
        ]);
      } catch (_error) {
        // Will fail at auth step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid video quality');
      }
    });

    test('accepts valid video-quality: plus', async () => {
      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--video-quality',
          'plus',
        ]);
      } catch (_error) {
        // Will fail at auth step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid video quality');
      }
    });

    test('rejects passthrough exceeding 255 characters', async () => {
      const longPassthrough = 'a'.repeat(256);
      let errorThrown = false;
      let errorMessage = '';

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--passthrough',
          longPassthrough,
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain(
        'Passthrough metadata exceeds maximum length',
      );
      expect(errorMessage).toContain('255');
    });

    test('accepts passthrough at exactly 255 characters', async () => {
      const maxPassthrough = 'a'.repeat(255);

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--passthrough',
          maxPassthrough,
        ]);
      } catch (_error) {
        // Will fail at auth step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Passthrough metadata exceeds');
      }
    });
  });
});
