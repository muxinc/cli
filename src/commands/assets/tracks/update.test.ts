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

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux assets tracks update command', () => {
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
      expect(updateCommand.getDescription()).toMatch(/update.*track/i);
    });

    test('requires asset-id and track-id arguments', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBe(2);
      expect(args[0].name).toBe('asset-id');
      expect(args[1].name).toBe('track-id');
    });
  });

  describe('Optional flags', () => {
    test.each([
      'name',
      'language-code',
      'closed-captions',
      'passthrough',
      'json',
    ])('has --%s flag', (flag) => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === flag);
      expect(option).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when arguments are not provided', async () => {
      try {
        await updateCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });

    test('errors when no field flags are provided', async () => {
      try {
        await updateCommand.parse(['some-asset-id', 'some-track-id']);
      } catch (_error) {
        // Expected to throw due to no field flags
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/at least one field/i);
    });
  });
});
