import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { updateNewAssetStaticRenditionsCommand } from './update-new-asset-static-renditions.ts';

describe('mux live update-new-asset-static-renditions command', () => {
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
      expect(updateNewAssetStaticRenditionsCommand.getDescription()).toMatch(
        /static.*rendition/i,
      );
    });

    test('requires stream-id argument', () => {
      const args = updateNewAssetStaticRenditionsCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('stream-id');
    });
  });

  describe('Required flags', () => {
    test('has --resolution flag', () => {
      const option = updateNewAssetStaticRenditionsCommand
        .getOptions()
        .find((opt) => opt.name === 'resolution');
      expect(option).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = updateNewAssetStaticRenditionsCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when stream-id is not provided', async () => {
      try {
        await updateNewAssetStaticRenditionsCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
