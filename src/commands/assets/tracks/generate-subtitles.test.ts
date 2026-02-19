import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { generateSubtitlesCommand } from './generate-subtitles.ts';

describe('mux assets tracks generate-subtitles command', () => {
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
      expect(generateSubtitlesCommand.getDescription()).toMatch(/subtitle/i);
    });

    test('requires asset-id and track-id arguments', () => {
      const args = generateSubtitlesCommand.getArguments();
      expect(args.length).toBe(2);
      expect(args[0].name).toBe('asset-id');
      expect(args[1].name).toBe('track-id');
    });
  });

  describe('Optional flags', () => {
    test('has --language-code flag', () => {
      const option = generateSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'language-code');
      expect(option).toBeDefined();
    });

    test('has --name flag', () => {
      const option = generateSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'name');
      expect(option).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = generateSubtitlesCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when arguments are not provided', async () => {
      try {
        await generateSubtitlesCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
