import { afterEach, describe, expect, it } from 'bun:test';
import {
  hasJsonFlag,
  isAgentMode,
  preprocessArgs,
  setAgentMode,
  setJsonFlag,
  wantsJson,
} from './context.ts';

describe('wantsJson', () => {
  afterEach(() => {
    setAgentMode(false);
  });

  it('returns false when --json is not set and agent mode is off', () => {
    expect(wantsJson({})).toBe(false);
    expect(wantsJson({ json: undefined })).toBe(false);
  });

  it('returns true when --json is set', () => {
    expect(wantsJson({ json: true })).toBe(true);
  });

  it('returns true in agent mode even without --json', () => {
    setAgentMode(true);
    expect(wantsJson({})).toBe(true);
  });

  it('returns true when both --json and agent mode are set', () => {
    setAgentMode(true);
    expect(wantsJson({ json: true })).toBe(true);
  });
});

describe('preprocessArgs', () => {
  afterEach(() => {
    setAgentMode(false);
    setJsonFlag(false);
  });

  it('passes args through unchanged when --agent is absent', () => {
    const args = ['assets', 'list', '--json'];
    expect(preprocessArgs(args)).toEqual(['assets', 'list', '--json']);
    expect(isAgentMode()).toBe(false);
  });

  it('strips --agent and enables agent mode', () => {
    const args = ['assets', 'list', '--agent'];
    expect(preprocessArgs(args)).toEqual(['assets', 'list']);
    expect(isAgentMode()).toBe(true);
  });

  it('does NOT inject --json (commands consult agent mode instead)', () => {
    const result = preprocessArgs(['login', '--agent']);
    expect(result).toEqual(['login']);
    expect(result).not.toContain('--json');
  });

  it('leaves an explicit --json in place alongside --agent', () => {
    const result = preprocessArgs(['assets', 'list', '--agent', '--json']);
    expect(result).toEqual(['assets', 'list', '--json']);
  });

  it('strips --agent regardless of position', () => {
    const result = preprocessArgs(['--agent', 'whoami']);
    expect(result).toEqual(['whoami']);
    expect(isAgentMode()).toBe(true);
  });

  it('records --json without stripping it', () => {
    const result = preprocessArgs(['assets', 'list', '--json']);
    expect(result).toEqual(['assets', 'list', '--json']);
    expect(hasJsonFlag()).toBe(true);
  });

  it('does not record the json flag when --json is absent', () => {
    preprocessArgs(['assets', 'list']);
    expect(hasJsonFlag()).toBe(false);
  });
});
