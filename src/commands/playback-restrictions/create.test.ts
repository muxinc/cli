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

describe('mux playback-restrictions create', () => {
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
      expect(createCommand.getDescription()).toMatch(/playback.*restriction/i);
    });
  });

  describe('Required flags', () => {
    test('has --allowed-domains flag', () => {
      const allowedDomainsOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'allowed-domains');
      expect(allowedDomainsOption).toBeDefined();
    });
  });

  describe('Optional flags', () => {
    test('has --allow-no-referrer flag', () => {
      const allowNoReferrerOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'allow-no-referrer');
      expect(allowNoReferrerOption).toBeDefined();
    });

    test('has --json flag for output formatting', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
    });
  });
});
