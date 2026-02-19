import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { deleteNewAssetStaticRenditionsCommand } from './delete-new-asset-static-renditions.ts';

describe('mux live delete-new-asset-static-renditions command', () => {
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
      expect(deleteNewAssetStaticRenditionsCommand.getDescription()).toMatch(
        /delete.*static.*rendition/i,
      );
    });

    test('requires stream-id argument', () => {
      const args = deleteNewAssetStaticRenditionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('stream-id');
    });
  });

  describe('Optional flags', () => {
    test('has --force flag to skip confirmation', () => {
      const forceOption = deleteNewAssetStaticRenditionsCommand
        .getOptions()
        .find((opt) => opt.name === 'force');
      expect(forceOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = deleteNewAssetStaticRenditionsCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when stream-id is not provided', async () => {
      try {
        await deleteNewAssetStaticRenditionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
