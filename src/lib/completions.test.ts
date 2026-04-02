import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectShell,
  getCompletionLine,
  getRcFilePath,
  installCompletions,
} from './completions.ts';

describe('completions', () => {
  describe('detectShell', () => {
    let originalShell: string | undefined;

    beforeEach(() => {
      originalShell = process.env.SHELL;
    });

    afterEach(() => {
      if (originalShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = originalShell;
      }
    });

    it('should detect zsh', () => {
      process.env.SHELL = '/bin/zsh';
      expect(detectShell()).toBe('zsh');
    });

    it('should detect bash', () => {
      process.env.SHELL = '/bin/bash';
      expect(detectShell()).toBe('bash');
    });

    it('should detect fish', () => {
      process.env.SHELL = '/usr/local/bin/fish';
      expect(detectShell()).toBe('fish');
    });

    it('should return null for unsupported shells', () => {
      process.env.SHELL = '/bin/csh';
      expect(detectShell()).toBeNull();
    });

    it('should return null when SHELL is not set', () => {
      delete process.env.SHELL;
      expect(detectShell()).toBeNull();
    });
  });

  describe('getRcFilePath', () => {
    it('should return ~/.zshrc for zsh', () => {
      const result = getRcFilePath('zsh');
      expect(result).toEndWith('.zshrc');
    });

    it('should return ~/.bashrc for bash', () => {
      const result = getRcFilePath('bash');
      expect(result).toEndWith('.bashrc');
    });

    it('should return ~/.config/fish/config.fish for fish', () => {
      const result = getRcFilePath('fish');
      expect(result).toEndWith(join('.config', 'fish', 'config.fish'));
    });
  });

  describe('getCompletionLine', () => {
    it('should return source line for zsh', () => {
      expect(getCompletionLine('zsh')).toBe('source <(mux completions zsh)');
    });

    it('should return source line for bash', () => {
      expect(getCompletionLine('bash')).toBe('source <(mux completions bash)');
    });

    it('should return source line for fish', () => {
      expect(getCompletionLine('fish')).toBe(
        'source (mux completions fish | psub)',
      );
    });
  });

  describe('installCompletions', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), 'mux-cli-completions-test-'));
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should append completion line to an existing rc file', async () => {
      const rcPath = join(testDir, '.zshrc');
      await writeFile(rcPath, '# existing content\n');

      const result = await installCompletions('zsh', rcPath);

      expect(result.installed).toBe(true);
      expect(result.alreadyInstalled).toBe(false);

      const content = await readFile(rcPath, 'utf-8');
      expect(content).toContain('source <(mux completions zsh)');
      expect(content).toStartWith('# existing content\n');
    });

    it('should create the rc file if it does not exist', async () => {
      const rcPath = join(testDir, '.zshrc');

      const result = await installCompletions('zsh', rcPath);

      expect(result.installed).toBe(true);
      const content = await readFile(rcPath, 'utf-8');
      expect(content).toContain('source <(mux completions zsh)');
    });

    it('should not duplicate if already installed', async () => {
      const rcPath = join(testDir, '.zshrc');
      await writeFile(rcPath, 'source <(mux completions zsh)\n');

      const result = await installCompletions('zsh', rcPath);

      expect(result.installed).toBe(false);
      expect(result.alreadyInstalled).toBe(true);

      const content = await readFile(rcPath, 'utf-8');
      const matches = content.match(/source <\(mux completions zsh\)/g);
      expect(matches).toHaveLength(1);
    });

    it('should detect existing install even with surrounding content', async () => {
      const rcPath = join(testDir, '.bashrc');
      await writeFile(
        rcPath,
        '# stuff\nsource <(mux completions bash)\n# more stuff\n',
      );

      const result = await installCompletions('bash', rcPath);

      expect(result.installed).toBe(false);
      expect(result.alreadyInstalled).toBe(true);
    });

    it('should work for fish shell', async () => {
      const rcPath = join(testDir, 'config.fish');

      const result = await installCompletions('fish', rcPath);

      expect(result.installed).toBe(true);
      const content = await readFile(rcPath, 'utf-8');
      expect(content).toContain('source (mux completions fish | psub)');
    });

    it('should add a trailing newline after the completion line', async () => {
      const rcPath = join(testDir, '.zshrc');
      await writeFile(rcPath, '# existing\n');

      await installCompletions('zsh', rcPath);

      const content = await readFile(rcPath, 'utf-8');
      expect(content).toEndWith('\n');
    });
  });
});
