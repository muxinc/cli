import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

type Shell = 'zsh' | 'bash' | 'fish';

const SUPPORTED_SHELLS: Shell[] = ['zsh', 'bash', 'fish'];

/**
 * Detect the user's shell from the SHELL environment variable.
 */
export function detectShell(): Shell | null {
  const shell = process.env.SHELL;
  if (!shell) return null;

  const name = basename(shell);
  if (SUPPORTED_SHELLS.includes(name as Shell)) {
    return name as Shell;
  }
  return null;
}

/**
 * Get the path to the rc file for a given shell.
 */
export function getRcFilePath(shell: Shell): string {
  const home = homedir();
  switch (shell) {
    case 'zsh':
      return join(home, '.zshrc');
    case 'bash':
      return join(home, '.bashrc');
    case 'fish':
      return join(home, '.config', 'fish', 'config.fish');
  }
}

/**
 * Get the completion source line for a given shell.
 */
export function getCompletionLine(shell: Shell): string {
  if (shell === 'fish') {
    return 'source (mux completions fish | psub)';
  }
  return `source <(mux completions ${shell})`;
}

export interface InstallResult {
  installed: boolean;
  alreadyInstalled: boolean;
}

/**
 * Install the completion source line into an rc file.
 */
export async function installCompletions(
  shell: Shell,
  rcPath?: string,
): Promise<InstallResult> {
  const filePath = rcPath ?? getRcFilePath(shell);
  const line = getCompletionLine(shell);

  let existing = '';
  if (existsSync(filePath)) {
    existing = await readFile(filePath, 'utf-8');
    if (existing.includes(line)) {
      return { installed: false, alreadyInstalled: true };
    }
  }

  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await writeFile(filePath, `${existing}${separator}${line}\n`);

  return { installed: true, alreadyInstalled: false };
}
