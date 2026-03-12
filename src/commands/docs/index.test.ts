import { describe, expect, test } from 'bun:test';
import { docsCommand } from './index.ts';

describe('mux docs command', () => {
  test('points agents to the JSON discovery command', () => {
    expect(docsCommand.getDescription()).toContain('mux docs path --json');
    expect(docsCommand.getDescription()).toMatch(/agent/i);
  });
});
