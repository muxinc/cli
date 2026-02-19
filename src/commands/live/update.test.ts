import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { updateCommand } from './update.ts';

describe('mux live update command', () => {
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
      expect(updateCommand.getDescription()).toMatch(/update.*live.*stream/i);
    });

    test('requires stream-id argument', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('stream-id');
    });
  });

  describe('Optional flags', () => {
    test('has --latency-mode flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'latency-mode');
      expect(option).toBeDefined();
    });

    test('has --reconnect-window flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'reconnect-window');
      expect(option).toBeDefined();
    });

    test('has --max-continuous-duration flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'max-continuous-duration');
      expect(option).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(option).toBeDefined();
    });

    test('has --reconnect-slate-url flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'reconnect-slate-url');
      expect(option).toBeDefined();
    });

    test('has --title flag', () => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'title');
      expect(option).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = updateCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when stream-id is not provided', async () => {
      try {
        await updateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('errors when no field flags are provided', async () => {
      try {
        await updateCommand.parse(['some-stream-id']);
      } catch (_error) {
        // Expected to throw due to no field flags
      }

      expect(exitSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
