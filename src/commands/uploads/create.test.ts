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

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux uploads create', () => {
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
      expect(createCommand.getDescription()).toMatch(/upload/i);
    });
  });

  describe('Required flags', () => {
    test('has --cors-origin flag', () => {
      const corsOriginOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'cors-origin');
      expect(corsOriginOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --playback-policy flag', () => {
      const playbackPolicyOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'playback-policy');
      expect(playbackPolicyOption).toBeDefined();
    });

    test('has --timeout flag', () => {
      const timeoutOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'timeout');
      expect(timeoutOption).toBeDefined();
    });

    test('has --test flag', () => {
      const testOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'test');
      expect(testOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });
});
