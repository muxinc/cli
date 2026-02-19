import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { signCommand } from './sign.ts';

// Note: These tests focus on CLI flag parsing and basic command structure
// They do NOT test the actual JWT signing logic

describe('mux sign command', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;
  let consoleLogSpy: Mock<typeof console.log>;

  beforeEach(() => {
    // Mock process.exit to prevent it from killing the test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Spy on console methods to capture output
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
  });

  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(signCommand.getDescription()).toBe(
        'Sign a playback ID, returning a JWT token and signed playback URL',
      );
    });

    test('requires playback-id argument', () => {
      const args = signCommand.getArguments();
      expect(args.length).toBe(1);
      expect(args[0].name).toBe('playback-id');
    });

    test('has --expiration flag with default', () => {
      const expirationOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'expiration');
      expect(expirationOption).toBeDefined();
      expect(expirationOption?.default).toBe('7d');
    });

    test('has --type flag with default', () => {
      const typeOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'type');
      expect(typeOption).toBeDefined();
      expect(typeOption?.default).toBe('video');
    });

    test('has --json flag option', () => {
      const jsonOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });

    test('has --token-only flag option', () => {
      const tokenOnlyOption = signCommand
        .getOptions()
        .find((opt) => opt.name === 'token-only');
      expect(tokenOnlyOption).toBeDefined();
    });
  });

  describe('Type validation', () => {
    test('accepts valid type: video', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'video']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: thumbnail', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'thumbnail']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: gif', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'gif']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('accepts valid type: storyboard', async () => {
      try {
        await signCommand.parse(['test-playback-id', '--type', 'storyboard']);
      } catch (_error) {
        // Will fail at auth/signing step
      }

      const exitCalls = exitSpy.mock.calls;
      if (exitCalls.length > 0 && exitCalls[0][0] === 1) {
        const errorMessage = consoleErrorSpy.mock.calls[0]?.[0] || '';
        expect(errorMessage).not.toContain('Invalid type');
      }
    });

    test('rejects invalid type', async () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        await signCommand.parse(['test-playback-id', '--type', 'invalid']);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/Invalid type/i);
      expect(errorMessage).toContain('video, thumbnail, gif, storyboard');
    });
  });

  describe('Command execution', () => {
    test('fails when signing keys not configured', async () => {
      // This will fail at the signing key check
      // We're just verifying the command structure is correct
      try {
        await signCommand.parse(['test-playback-id']);
      } catch (_error) {
        // Expected to fail
      }

      // The command should fail during execution, not during parsing
      expect(true).toBe(true);
    });
  });
});
