import { describe, expect, test } from 'bun:test';
import { docsCommand } from './index.ts';
import { readCommand } from './read.ts';
import { searchCommand } from './search.ts';
import { sourceCommand } from './source.ts';
import { updateCommand } from './update.ts';

describe('mux docs command', () => {
  test('has a docs-focused description', () => {
    expect(docsCommand.getDescription()).toMatch(/Mux docs/i);
  });

  test('registers docs subcommands', () => {
    const commandNames = docsCommand
      .getCommands()
      .map((command) => command.getName());

    expect(commandNames).toContain('search');
    expect(commandNames).toContain('read');
    expect(commandNames).toContain('update');
    expect(commandNames).toContain('source');
  });
});

describe('mux docs search command', () => {
  test('describes docs search', () => {
    expect(searchCommand.getDescription()).toMatch(/search.*docs/i);
  });

  test('accepts a query argument', () => {
    const args = searchCommand.getArguments();

    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name).toMatch(/query/i);
  });

  test('has agent-friendly output and source options', () => {
    const optionNames = searchCommand.getOptions().map((option) => option.name);

    expect(optionNames).toContain('json');
    expect(optionNames).toContain('limit');
    expect(optionNames).toContain('source');
  });
});

describe('mux docs read command', () => {
  test('describes reading a docs page', () => {
    expect(readCommand.getDescription()).toMatch(/read.*docs/i);
  });

  test('accepts a doc id argument', () => {
    const args = readCommand.getArguments();

    expect(args.length).toBe(1);
    expect(args[0]?.name).toMatch(/doc.*id|id/i);
  });

  test('has markdown and JSON output options', () => {
    const optionNames = readCommand.getOptions().map((option) => option.name);

    expect(optionNames).toContain('format');
    expect(optionNames).toContain('json');
    expect(optionNames).toContain('source');
  });
});

describe('mux docs update command', () => {
  test('describes refreshing the docs cache', () => {
    expect(updateCommand.getDescription()).toMatch(/update|refresh/i);
  });

  test('has source, force, and JSON options', () => {
    const optionNames = updateCommand.getOptions().map((option) => option.name);

    expect(optionNames).toContain('source');
    expect(optionNames).toContain('force');
    expect(optionNames).toContain('json');
  });
});

describe('mux docs source command', () => {
  test('describes showing the active docs source', () => {
    expect(sourceCommand.getDescription()).toMatch(/source/i);
  });

  test('has a JSON option', () => {
    const optionNames = sourceCommand.getOptions().map((option) => option.name);

    expect(optionNames).toContain('json');
  });
});
