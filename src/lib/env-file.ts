/**
 * Write variables into a project's dotenv file (e.g. `.env.local`) without
 * disturbing anything else in it.
 */

import { constants } from 'node:fs';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export interface UpsertResult {
  content: string;
  /** Variables that were already assigned and now carry the new value. */
  updated: string[];
  /** Variables that were not present and were appended. */
  added: string[];
}

export interface WriteEnvVarsResult {
  created: boolean;
  updated: string[];
  added: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Set each variable in dotenv-formatted `content`, returning the new content.
 *
 * Existing assignments are rewritten in place (every occurrence, so no stale
 * duplicate is left for a loader that reads the last one), keeping an `export`
 * prefix. A quoted value that spans several lines, as a PEM key often does, is
 * replaced as a whole. Missing variables are appended. Comments, blank lines,
 * and every other variable are left exactly as they were.
 *
 * Values are written unquoted, so callers must pass values without whitespace,
 * quotes, or `#` (true of Mux key IDs and base64 private keys).
 */
export function upsertEnvContent(
  content: string,
  vars: Record<string, string>,
): UpsertResult {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content === '' ? [] : content.split(/\r?\n/);
  // A trailing newline produces one empty final element; drop it and restore
  // the newline when joining.
  const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  if (hadTrailingNewline) lines.pop();

  const updated: string[] = [];
  const added: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(
      `^(\\s*(?:export\\s+)?)${escapeRegExp(key)}\\s*=\\s*(.*)$`,
    );
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (!match) continue;
      found = true;

      // A value opened with a quote that does not close on the same line
      // continues until the line that closes it. With no closing line the
      // quote is a typo rather than a multi-line value, and only this line
      // is replaced: the lines after it are other variables, not the key.
      const raw = match[2];
      const quote = raw[0];
      if ((quote === '"' || quote === "'") && !raw.slice(1).includes(quote)) {
        let end = i + 1;
        while (end < lines.length && !lines[end].includes(quote)) end++;
        if (end < lines.length) lines.splice(i + 1, end - i);
      }

      lines[i] = `${match[1]}${key}=${value}`;
    }

    if (found) {
      updated.push(key);
    } else {
      lines.push(`${key}=${value}`);
      added.push(key);
    }
  }

  return {
    content: lines.length > 0 ? lines.join(eol) + eol : '',
    updated,
    added,
  };
}

/**
 * Fail early, before anything irreversible happens, if `path` cannot be
 * written: its directory must exist, and an existing entry must be a regular
 * file this process can read and write.
 */
export async function assertEnvFileWritable(path: string): Promise<void> {
  const absolute = resolve(path);
  const directory = dirname(absolute);

  const dirStat = await stat(directory).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(
      `Cannot write ${path}: the directory ${directory} does not exist.`,
    );
  }

  const fileStat = await stat(absolute).catch(() => null);
  if (fileStat) {
    if (!fileStat.isFile()) {
      throw new Error(`Cannot write ${path}: it is not a file.`);
    }
    try {
      await access(absolute, constants.R_OK | constants.W_OK);
    } catch {
      throw new Error(`Cannot write ${path}: permission denied.`);
    }
    return;
  }

  try {
    await access(directory, constants.W_OK);
  } catch {
    throw new Error(
      `Cannot write ${path}: the directory ${directory} is not writable.`,
    );
  }
}

/**
 * Set variables in the dotenv file at `path`, creating it (readable only by
 * its owner) when missing.
 */
export async function writeEnvVars(
  path: string,
  vars: Record<string, string>,
): Promise<WriteEnvVarsResult> {
  let existing: string | null = null;
  try {
    existing = await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const result = upsertEnvContent(existing ?? '', vars);
  // `mode` only applies when the file is created; an existing file keeps its
  // permissions.
  await writeFile(path, result.content, { mode: 0o600 });

  return {
    created: existing === null,
    updated: result.updated,
    added: result.added,
  };
}

/**
 * Whether git ignores `path`: true or false inside a work tree, or null when
 * that cannot be determined (not a repository, or git is unavailable).
 */
export function isGitIgnored(path: string): boolean | null {
  const absolute = resolve(path);
  try {
    // Relative to its own directory: an absolute path through a symlink
    // (macOS /var -> /private/var) reads as outside the work tree to git.
    const proc = Bun.spawnSync(
      ['git', 'check-ignore', '-q', basename(absolute)],
      {
        cwd: dirname(absolute),
        stdout: 'ignore',
        stderr: 'ignore',
        stdin: 'ignore',
      },
    );
    // 0: ignored, 1: not ignored, 128: not a repository or another error.
    if (proc.exitCode === 0) return true;
    if (proc.exitCode === 1) return false;
    return null;
  } catch {
    return null;
  }
}
