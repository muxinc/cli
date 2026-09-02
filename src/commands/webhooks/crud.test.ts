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
import { deleteCommand } from './delete.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { updateCommand } from './update.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux webhooks CRUD commands', () => {
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

  describe('mux webhooks create', () => {
    test('has correct command description', () => {
      expect(createCommand.getDescription()).toMatch(/create.*webhook/i);
    });

    test('has a required --address flag', () => {
      const option = createCommand
        .getOptions()
        .find((opt) => opt.name === 'address');
      expect(option).toBeDefined();
      expect(option?.required).toBe(true);
    });

    test('errors when --address is not provided', async () => {
      let rejected = false;
      try {
        await createCommand.parse([]);
      } catch (_error) {
        rejected = true;
      }
      expect(rejected || exitSpy.mock.calls.length > 0).toBe(true);
    });
  });

  describe('mux webhooks list', () => {
    test('has correct command description', () => {
      expect(listCommand.getDescription()).toMatch(/list.*webhook/i);
    });

    test('has --json flag for output formatting', () => {
      const option = listCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(option).toBeDefined();
    });
  });

  describe('mux webhooks get', () => {
    test('requires webhook-id argument', () => {
      const args = getCommand.getArguments();
      expect(args.length).toBe(1);
      expect(args[0].name).toBe('webhook-id');
    });
  });

  describe('mux webhooks update', () => {
    test('requires webhook-id argument', () => {
      const args = updateCommand.getArguments();
      expect(args.length).toBe(1);
      expect(args[0].name).toBe('webhook-id');
    });

    test.each([
      'address',
      'enable',
      'disable',
      'json',
    ])('has --%s flag', (flag) => {
      const option = updateCommand
        .getOptions()
        .find((opt) => opt.name === flag);
      expect(option).toBeDefined();
    });

    test('errors when no field flags are provided', async () => {
      try {
        await updateCommand.parse(['webhook_123']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/at least one field/i);
    });

    test('errors when --enable is combined with --disable', async () => {
      try {
        await updateCommand.parse(['webhook_123', '--enable', '--disable']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/cannot be combined/i);
    });
  });

  describe('mux webhooks delete', () => {
    test('requires webhook-id argument', () => {
      const args = deleteCommand.getArguments();
      expect(args.length).toBe(1);
      expect(args[0].name).toBe('webhook-id');
    });

    test('has --force flag to skip confirmation', () => {
      const option = deleteCommand
        .getOptions()
        .find((opt) => opt.name === 'force');
      expect(option).toBeDefined();
    });

    test('requires --force in JSON mode', async () => {
      try {
        await deleteCommand.parse(['webhook_123', '--json']);
      } catch (_error) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      const output = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(String(output)).toMatch(/--force/);
    });
  });
});
