import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { updateEmbeddedSubtitlesCommand } from './update-embedded-subtitles.ts';

describe('mux live update-embedded-subtitles command', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(updateEmbeddedSubtitlesCommand.getDescription()).toMatch(
        /embedded.*subtitle/i,
      );
    });

    test('requires stream-id argument', () => {
      const args = updateEmbeddedSubtitlesCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('stream-id');
    });
  });

  describe('Optional flags', () => {
    test('has --language-channel flag', () => {
      const option = updateEmbeddedSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'language-channel');
      expect(option).toBeDefined();
    });

    test('has --language-code flag', () => {
      const option = updateEmbeddedSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'language-code');
      expect(option).toBeDefined();
    });

    test('has --name flag', () => {
      const option = updateEmbeddedSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'name');
      expect(option).toBeDefined();
    });

    test('has --clear flag', () => {
      const option = updateEmbeddedSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'clear');
      expect(option).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = updateEmbeddedSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when stream-id is not provided', async () => {
      try {
        await updateEmbeddedSubtitlesCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
