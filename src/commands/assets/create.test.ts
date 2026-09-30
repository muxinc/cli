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
import type Mux from '@mux/ts';
import { setAgentMode } from '@/lib/context.ts';
import {
  createCommand,
  waitForAsset,
  waitForUploadAsset,
  waitForUploads,
} from './create.ts';

const noSleep = async () => {};

/**
 * Build a fake Mux client whose upload/asset retrieve calls return the given
 * responses in order, repeating the last one once the list is exhausted.
 */
function fakeMux({
  uploads = [],
  assets = [],
}: {
  uploads?: Partial<Mux.Video.Upload>[];
  assets?: Partial<Mux.Video.Asset>[];
}) {
  const next = <T>(list: T[], calls: number) =>
    list[Math.min(calls, list.length - 1)];
  const calls = { uploads: 0, assets: 0 };

  const mux = {
    video: {
      uploads: {
        retrieve: async () => next(uploads, calls.uploads++),
      },
      assets: {
        retrieve: async () => next(assets, calls.assets++),
      },
    },
  } as unknown as Mux;

  return { mux, calls };
}

describe('waitForUploadAsset', () => {
  test('polls until the upload has created an asset', async () => {
    const { mux, calls } = fakeMux({
      uploads: [
        { id: 'up1', status: 'waiting' },
        { id: 'up1', status: 'waiting' },
        { id: 'up1', status: 'asset_created', asset_id: 'asset1' },
      ],
    });

    const assetId = await waitForUploadAsset(mux, 'up1', { sleep: noSleep });

    expect(assetId).toBe('asset1');
    expect(calls.uploads).toBe(3);
  });

  test('throws when the upload errors', async () => {
    const { mux } = fakeMux({
      uploads: [
        {
          id: 'up1',
          status: 'errored',
          error: { type: 'invalid_input', message: 'Bad file' },
        },
      ],
    });

    await expect(
      waitForUploadAsset(mux, 'up1', { sleep: noSleep }),
    ).rejects.toThrow('Upload up1 errored: Bad file');
  });

  test('throws when the upload is cancelled or times out', async () => {
    for (const status of ['cancelled', 'timed_out'] as const) {
      const { mux } = fakeMux({ uploads: [{ id: 'up1', status }] });

      await expect(
        waitForUploadAsset(mux, 'up1', { sleep: noSleep }),
      ).rejects.toThrow(`Upload up1 ${status}`);
    }
  });

  test('throws after the maximum number of attempts', async () => {
    const { mux, calls } = fakeMux({
      uploads: [{ id: 'up1', status: 'waiting' }],
    });

    await expect(
      waitForUploadAsset(mux, 'up1', { sleep: noSleep, maxAttempts: 3 }),
    ).rejects.toThrow('Timed out waiting for upload up1 to create an asset');
    expect(calls.uploads).toBe(3);
  });
});

describe('waitForUploads', () => {
  /**
   * Fake client keyed by ID, so each upload resolves to its own asset.
   */
  function fakeMuxById(
    uploads: Record<string, Partial<Mux.Video.Upload>>,
    assets: Record<string, Partial<Mux.Video.Asset>>,
  ) {
    return {
      video: {
        uploads: { retrieve: async (id: string) => uploads[id] },
        assets: { retrieve: async (id: string) => assets[id] },
      },
    } as unknown as Mux;
  }

  const uploaded = [
    { file: 'good.mp4', uploadId: 'up1', status: 'waiting' },
    { file: 'bad.mp4', uploadId: 'up2', status: 'waiting' },
    { file: 'also-good.mp4', uploadId: 'up3', status: 'waiting' },
  ];

  test('returns an entry per file with the ready asset', async () => {
    const mux = fakeMuxById(
      {
        up1: { id: 'up1', status: 'asset_created', asset_id: 'a1' },
        up3: { id: 'up3', status: 'asset_created', asset_id: 'a3' },
      },
      {
        a1: { id: 'a1', status: 'ready' },
        a3: { id: 'a3', status: 'ready' },
      },
    );

    const results = await waitForUploads(mux, [uploaded[0], uploaded[2]], {
      sleep: noSleep,
    });

    expect(results).toEqual([
      {
        file: 'good.mp4',
        uploadId: 'up1',
        status: 'ready',
        assetId: 'a1',
        asset: { id: 'a1', status: 'ready' } as Mux.Video.Asset,
      },
      {
        file: 'also-good.mp4',
        uploadId: 'up3',
        status: 'ready',
        assetId: 'a3',
        asset: { id: 'a3', status: 'ready' } as Mux.Video.Asset,
      },
    ]);
  });

  test('keeps going after a failed file and records its error', async () => {
    const mux = fakeMuxById(
      {
        up1: { id: 'up1', status: 'asset_created', asset_id: 'a1' },
        up2: { id: 'up2', status: 'asset_created', asset_id: 'a2' },
        up3: { id: 'up3', status: 'asset_created', asset_id: 'a3' },
      },
      {
        a1: { id: 'a1', status: 'ready' },
        a2: {
          id: 'a2',
          status: 'errored',
          errors: { messages: ['Not a valid video'] },
        },
        a3: { id: 'a3', status: 'ready' },
      },
    );

    const results = await waitForUploads(mux, uploaded, { sleep: noSleep });

    expect(results.map((r) => [r.file, r.status])).toEqual([
      ['good.mp4', 'ready'],
      ['bad.mp4', 'errored'],
      ['also-good.mp4', 'ready'],
    ]);
    expect(results[1].assetId).toBe('a2');
    expect(results[1].asset).toBeUndefined();
    expect(results[1].error).toBe('Asset processing failed: Not a valid video');
    expect(results[0].error).toBeUndefined();
  });

  test('records an upload that never creates an asset', async () => {
    const mux = fakeMuxById(
      {
        up1: {
          id: 'up1',
          status: 'errored',
          error: { type: 'invalid_input', message: 'Bad file' },
        },
      },
      {},
    );

    const [result] = await waitForUploads(mux, [uploaded[0]], {
      sleep: noSleep,
    });

    expect(result.status).toBe('errored');
    expect(result.assetId).toBeUndefined();
    expect(result.error).toBe('Upload up1 errored: Bad file');
  });
});

describe('waitForAsset', () => {
  test('polls until the asset is no longer preparing', async () => {
    const { mux, calls } = fakeMux({
      assets: [
        { id: 'asset1', status: 'preparing' },
        { id: 'asset1', status: 'ready' },
      ],
    });

    const asset = await waitForAsset(
      mux,
      { id: 'asset1', status: 'preparing' } as Mux.Video.Asset,
      { sleep: noSleep },
    );

    expect(asset.status).toBe('ready');
    expect(calls.assets).toBe(2);
  });

  test('returns immediately when the asset is already ready', async () => {
    const { mux, calls } = fakeMux({});

    const asset = await waitForAsset(
      mux,
      { id: 'asset1', status: 'ready' } as Mux.Video.Asset,
      { sleep: noSleep },
    );

    expect(asset.status).toBe('ready');
    expect(calls.assets).toBe(0);
  });

  test('throws when the asset errors', async () => {
    const { mux } = fakeMux({
      assets: [
        {
          id: 'asset1',
          status: 'errored',
          errors: { messages: ['Unsupported codec'] },
        },
      ],
    });

    await expect(
      waitForAsset(
        mux,
        { id: 'asset1', status: 'preparing' } as Mux.Video.Asset,
        { sleep: noSleep },
      ),
    ).rejects.toThrow('Asset processing failed: Unsupported codec');
  });

  test('returns the still-preparing asset after the maximum number of attempts', async () => {
    const { mux, calls } = fakeMux({
      assets: [{ id: 'asset1', status: 'preparing' }],
    });

    const asset = await waitForAsset(
      mux,
      { id: 'asset1', status: 'preparing' } as Mux.Video.Asset,
      { sleep: noSleep, maxAttempts: 3 },
    );

    expect(asset.status).toBe('preparing');
    expect(calls.assets).toBe(3);
  });
});

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
    setAgentMode(false);
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

    test('fails fast in agent mode when multiple files need confirmation and -y is omitted', async () => {
      setAgentMode(true);
      const fileA = join(tempDir, 'a.mp4');
      const fileB = join(tempDir, 'b.mp4');
      await writeFile(fileA, 'fake video content');
      await writeFile(fileB, 'fake video content');

      try {
        await createCommand.parse(['--upload', fileA, '--upload', fileB]);
      } catch (_error) {
        // Expected to throw via mocked process.exit
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(String(consoleErrorSpy.mock.calls[0][0]));
      expect(parsed.error).toMatch(/-y/);
      expect(parsed.error).toMatch(/2 files/);
    });

    test('fails fast with --json when multiple files need confirmation and -y is omitted', async () => {
      const fileA = join(tempDir, 'a.mp4');
      const fileB = join(tempDir, 'b.mp4');
      await writeFile(fileA, 'fake video content');
      await writeFile(fileB, 'fake video content');

      try {
        await createCommand.parse([
          '--upload',
          fileA,
          '--upload',
          fileB,
          '--json',
        ]);
      } catch (_error) {
        // Expected to throw via mocked process.exit
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(String(consoleErrorSpy.mock.calls[0][0]));
      expect(parsed.error).toMatch(/-y/);
    });

    test('does not require -y for a single file in agent mode', async () => {
      // Isolate credentials so the command fails at the auth step, which
      // comes after the confirmation check, without touching the network.
      const originalXdg = process.env.XDG_CONFIG_HOME;
      const originalTokenId = process.env.MUX_TOKEN_ID;
      const originalTokenSecret = process.env.MUX_TOKEN_SECRET;
      process.env.XDG_CONFIG_HOME = tempDir;
      delete process.env.MUX_TOKEN_ID;
      delete process.env.MUX_TOKEN_SECRET;

      try {
        setAgentMode(true);
        const fileA = join(tempDir, 'a.mp4');
        await writeFile(fileA, 'fake video content');

        try {
          await createCommand.parse(['--upload', fileA]);
        } catch (_error) {
          // Expected to fail at the auth step
        }

        expect(exitSpy).toHaveBeenCalledWith(1);
        const errorMessage = String(consoleErrorSpy.mock.calls[0]?.[0] || '');
        expect(errorMessage).not.toContain('-y');
      } finally {
        if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = originalXdg;
        if (originalTokenId === undefined) delete process.env.MUX_TOKEN_ID;
        else process.env.MUX_TOKEN_ID = originalTokenId;
        if (originalTokenSecret === undefined)
          delete process.env.MUX_TOKEN_SECRET;
        else process.env.MUX_TOKEN_SECRET = originalTokenSecret;
      }
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

    test('emits machine-readable JSON errors in agent mode without --json', async () => {
      setAgentMode(true);

      try {
        await createCommand.parse([
          '--url',
          'https://example.com/video.mp4',
          '--file',
          join(tempDir, 'config.json'),
        ]);
      } catch (_error) {
        // Expected to throw via mocked process.exit
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorMessage = String(consoleErrorSpy.mock.calls[0][0]);
      const parsed = JSON.parse(errorMessage);
      expect(parsed.error).toMatch(/Cannot use multiple input methods/);
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
        'Create a Mux video asset from a URL, local file upload, or JSON config',
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
