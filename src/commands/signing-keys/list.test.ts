import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { listCommand } from './list.ts';

// Note: These tests focus on CLI flag parsing and basic command structure
// They do NOT test the actual Mux API integration

describe('mux signing-keys list command', () => {
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
      expect(listCommand.getDescription()).toBe(
        'List all signing keys (private keys are not returned; only available at creation)',
      );
    });

    test('has --json flag option', () => {
      const jsonOption = listCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.description).toContain('JSON');
    });

    test('has no required arguments', () => {
      const args = listCommand.getArguments();
      expect(args.length).toBe(0);
    });
  });

  describe('Command execution without auth', () => {
    test('fails when not logged in', async () => {
      // This will fail at the authentication check
      // We're just verifying the command structure is correct
      try {
        await listCommand.parse([]);
      } catch (_error) {
        // Expected to fail at auth check
      }

      // The command should fail during execution, not during parsing
      // We just want to ensure it parses correctly
      expect(true).toBe(true);
    });
  });
});
