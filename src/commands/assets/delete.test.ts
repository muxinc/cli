import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { setAgentMode } from '@/lib/context.ts';
import { deleteCommand } from './delete.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux assets delete command', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Spy on console.error to capture error messages
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(deleteCommand.getDescription()).toMatch(/delete.*asset/i);
    });

    test('requires asset-id argument', () => {
      const args = deleteCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });
  });

  describe('Force guard', () => {
    test('agent mode without --force fails with guidance that names agent mode', async () => {
      const originalTokenId = process.env.MUX_TOKEN_ID;
      const originalTokenSecret = process.env.MUX_TOKEN_SECRET;
      process.env.MUX_TOKEN_ID = 'env_id';
      process.env.MUX_TOKEN_SECRET = 'env_secret';
      setAgentMode(true);

      try {
        await deleteCommand.parse(['asset-123']);
      } catch (_error) {
        // Expected to throw via mocked process.exit
      } finally {
        setAgentMode(false);
        if (originalTokenId === undefined) delete process.env.MUX_TOKEN_ID;
        else process.env.MUX_TOKEN_ID = originalTokenId;
        if (originalTokenSecret === undefined)
          delete process.env.MUX_TOKEN_SECRET;
        else process.env.MUX_TOKEN_SECRET = originalTokenSecret;
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(String(consoleErrorSpy.mock.calls[0][0]));
      expect(parsed.error).toContain('--force');
      expect(parsed.error).toContain('agent mode');
    });
  });

  describe('Optional flags', () => {
    test('has --force flag to skip confirmation', () => {
      const forceOption = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'force');
      expect(forceOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when asset-id is not provided', async () => {
      try {
        await deleteCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
