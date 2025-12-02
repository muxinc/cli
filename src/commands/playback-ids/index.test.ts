import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { playbackIdsCommand } from './index.ts';

describe('mux playback-ids command', () => {
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
      expect(playbackIdsCommand.getDescription()).toMatch(/playback.*id/i);
    });

    test('requires playback-id argument', () => {
      const args = playbackIdsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('playback-id');
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = playbackIdsCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --expand flag for fetching full object', () => {
      const expandOption = playbackIdsCommand
        .getOptions()
        .find((opt) => opt.name === 'expand');
      expect(expandOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when playback-id is not provided', async () => {
      try {
        await playbackIdsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
