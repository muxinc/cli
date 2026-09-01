import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { deleteCommand } from './delete.ts';
import { generateCommand } from './generate.ts';
import { getCommand } from './get.ts';
import { shotsCommand } from './index.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux assets shots commands', () => {
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

  describe('Command group', () => {
    test('has correct group description', () => {
      expect(shotsCommand.getDescription()).toMatch(/shot/i);
    });

    test.each([
      'get',
      'generate',
      'delete',
    ])('registers the %s subcommand', (name) => {
      expect(shotsCommand.getCommand(name)).toBeDefined();
    });
  });

  describe.each([
    ['get', getCommand],
    ['generate', generateCommand],
    ['delete', deleteCommand],
  ])('mux assets shots %s', (_name, command) => {
    test('requires asset-id argument', () => {
      const args = command.getArguments();
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name).toBe('asset-id');
    });

    test('has --json flag for output formatting', () => {
      const option = command.getOptions().find((opt) => opt.name === 'json');
      expect(option).toBeDefined();
    });

    test('rejects a missing asset-id argument', async () => {
      // With a parent group registered, Cliffy throws instead of exiting
      let rejected = false;
      try {
        await command.parse([]);
      } catch (_error) {
        rejected = true;
      }

      expect(rejected || exitSpy.mock.calls.length > 0).toBe(true);
    });
  });

  describe('mux assets shots delete safety', () => {
    test('has --force flag to skip confirmation', () => {
      const option = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'force');
      expect(option).toBeDefined();
    });
  });
});
