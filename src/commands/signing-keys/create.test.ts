import { describe, expect, test } from 'bun:test';
import { createCommand } from './create.ts';

// Note: These tests focus on CLI flag parsing and basic command structure
// They do NOT test the actual Mux API integration or config file writes
// Execution tests are omitted because the command uses interactive prompts
// that depend on local config state

describe('mux signing-keys create command', () => {
  describe('Command metadata', () => {
    test('has correct command description', () => {
      expect(createCommand.getDescription()).toBe(
        'Create a signing key and save to current environment (private key only available at creation)',
      );
    });

    test('has --json flag option', () => {
      const jsonOption = createCommand
        .getOptions()
        .find((opt) => opt.name === 'json');
      expect(jsonOption).toBeDefined();
      expect(jsonOption?.description).toContain('JSON');
    });

    test('has no required arguments', () => {
      const args = createCommand.getArguments();
      expect(args.length).toBe(0);
    });
  });
});
