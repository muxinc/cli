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

describe('mux assets tracks create command', () => {
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
      expect(createCommand.getDescription()).toMatch(/track/i);
    });

    test('requires asset-id argument', () => {
      const args = createCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Required flags', () => {
    test('has --url flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'url');
      expect(option).toBeDefined();
    });

    test('has --type flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'type');
      expect(option).toBeDefined();
    });

    test('has --language-code flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'language-code');
      expect(option).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --name flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'name');
      expect(option).toBeDefined();
    });

    test('has --text-type flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'text-type');
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
    test('throws error when asset-id is not provided', async () => {
      try {
        await createCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
