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
import { editCaptionsCommand, parseReplacement } from './edit-captions.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux robots edit-captions', () => {
  let tempDir: string;
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-robots-test-'));

    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(editCaptionsCommand.getDescription()).toMatch(/edit.*caption/i);
    });

    test('requires asset-id argument', () => {
      const args = editCaptionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Flags', () => {
    test.each([
      'track-id',
      'replace',
      'case-sensitive',
      'censor-profanity',
      'censor-mode',
      'delete-original-track',
      'track-name-suffix',
      'no-upload',
      'passthrough',
      'file',
      'wait',
      'json',
    ])('has --%s flag', (flag) => {
      const opt = editCaptionsCommand.getOptions().find((o) => o.name === flag);
      expect(opt).toBeDefined();
    });
  });

  describe('parseReplacement', () => {
    test('splits find and replace on the first equals sign', () => {
      expect(parseReplacement('foo=bar')).toEqual({
        find: 'foo',
        replace: 'bar',
      });
    });

    test('keeps additional equals signs in the replacement', () => {
      expect(parseReplacement('a=b=c')).toEqual({ find: 'a', replace: 'b=c' });
    });

    test('allows an empty replacement to delete the found text', () => {
      expect(parseReplacement('profanity=')).toEqual({
        find: 'profanity',
        replace: '',
      });
    });

    test('passes case sensitivity through', () => {
      expect(parseReplacement('Foo=Bar', true)).toEqual({
        find: 'Foo',
        replace: 'Bar',
        case_sensitive: true,
      });
    });

    test('rejects values without an equals sign', () => {
      expect(() => parseReplacement('nope')).toThrow(/find=replace/);
    });

    test('rejects values with an empty find term', () => {
      expect(() => parseReplacement('=bar')).toThrow(/find=replace/);
    });
  });

  describe('Input validation', () => {
    test('errors when --track-id is missing without --file', async () => {
      try {
        await editCaptionsCommand.parse(['asset_abc', '--replace', 'a=b']);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--track-id is required/i);
    });

    test('errors when no edit is specified', async () => {
      try {
        await editCaptionsCommand.parse(['asset_abc', '--track-id', 'trk_1']);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/at least one edit/i);
    });

    test('rejects invalid --censor-mode value', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await editCaptionsCommand.parse([
          'asset_abc',
          '--track-id',
          'trk_1',
          '--censor-mode',
          'bleep',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/censor-mode/i);
    });
  });

  describe('--file mode', () => {
    test('errors when --file combined with --replace', async () => {
      const configPath = join(tempDir, 'config.json');
      await writeFile(
        configPath,
        JSON.stringify({ track_id: 'trk_1', replacements: [] }),
      );
      try {
        await editCaptionsCommand.parse([
          'asset_abc',
          '--file',
          configPath,
          '--replace',
          'a=b',
        ]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/--file cannot be combined/i);
    });
  });
});
