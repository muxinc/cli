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

describe('mux assets static-renditions create command', () => {
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
      expect(createCommand.getDescription()).toMatch(
        /create.*static.rendition/i,
      );
    });

    test('requires asset-id argument', () => {
      const args = createCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Required flags', () => {
    test('has --resolution flag', () => {
      const resolutionOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'resolution');
      expect(resolutionOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --passthrough flag for custom metadata', () => {
      const passthroughOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'passthrough');
      expect(passthroughOption).toBeDefined();
    });

    test('has --wait flag for polling until ready', () => {
      const waitOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'wait');
      expect(waitOption).toBeDefined();
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

    test('throws error when --resolution is not provided', async () => {
      try {
        await createCommand.parse(['asset-123']);
      } catch (_error) {
        // Expected to throw
      }
      expect(exitSpy).toHaveBeenCalled();
    });

    test('throws error for invalid resolution value', async () => {
      let errorThrown = false;
      try {
        await createCommand.parse(['asset-123', '--resolution', 'invalid']);
      } catch (error) {
        errorThrown = true;
        expect(String(error)).toMatch(/invalid resolution/i);
      }
      expect(errorThrown).toBe(true);
    });

    test('resolution option is required', () => {
      const options = createCommand.getOptions();
      const resolutionOption = options.find((opt) => opt.name === 'resolution');
      expect(resolutionOption).toBeDefined();
      expect(resolutionOption?.required).toBe(true);
    });
  });
});
