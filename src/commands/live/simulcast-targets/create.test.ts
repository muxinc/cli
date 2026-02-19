import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { createCommand } from './create.ts';

describe('mux live simulcast-targets create command', () => {
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
      expect(createCommand.getDescription()).toMatch(/simulcast.*target/i);
    });

    test('requires stream-id argument', () => {
      const args = createCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('stream-id');
    });
  });

  describe('Required flags', () => {
    test('has --url flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'url');
      expect(option).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --stream-key flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'stream-key');
      expect(option).toBeDefined();
    });

    test('has --passthrough flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(option).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when stream-id is not provided', async () => {
      try {
        await createCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
