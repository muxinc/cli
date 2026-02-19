import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { updateUserAgentCommand } from './update-user-agent.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux playback-restrictions update-user-agent', () => {
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
      expect(updateUserAgentCommand.getDescription()).toMatch(/user.*agent/i);
    });

    test('requires restriction-id argument', () => {
      const args = updateUserAgentCommand.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('restriction-id');
    });
  });

  describe('Required flags', () => {
    test('has --allow-no-user-agent flag', () => {
      const allowNoUserAgentOption = updateUserAgentCommand
        .getOptions()
        .find((opt) => opt.name === 'allow-no-user-agent');
      expect(allowNoUserAgentOption).toBeDefined();
    });

    test('has --allow-high-risk-user-agent flag', () => {
      const allowHighRiskUserAgentOption = updateUserAgentCommand
        .getOptions()
        .find((opt) => opt.name === 'allow-high-risk-user-agent');
      expect(allowHighRiskUserAgentOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --json flag for output formatting', () => {
      const jsonOption = updateUserAgentCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });

  describe('Input validation', () => {
    test('throws error when restriction-id is not provided', async () => {
      try {
        await updateUserAgentCommand.parse([]);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
