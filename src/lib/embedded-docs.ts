import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { getDataDir } from './xdg.ts';

export interface EmbeddedDocsPaths {
  rootPath: string;
  skillPath: string;
  docsPath: string;
  agentsPath: string | null;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}

function getAncestorDirs(start: string, maxDepth = 8): string[] {
  const ancestors: string[] = [];
  let current = resolve(start);

  for (let depth = 0; depth < maxDepth; depth++) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return ancestors;
}

function tryRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function getCandidateRoots(execPath: string, cwd: string): string[] {
  const execDir = dirname(execPath);
  const realExecDir = dirname(tryRealpath(execPath));
  const anchors = uniquePaths([
    getDataDir(),
    cwd,
    execDir,
    realExecDir,
    ...(process.env.MUX_SHARE_DIR ? [process.env.MUX_SHARE_DIR] : []),
  ]);

  const roots: string[] = [];
  for (const anchor of anchors) {
    for (const dir of getAncestorDirs(anchor)) {
      roots.push(dir);
      roots.push(join(dir, 'share'));
      roots.push(join(dir, 'share', 'mux'));
      roots.push(join(dir, 'cli'));
      roots.push(join(dir, '@mux', 'cli'));
      roots.push(join(dir, 'node_modules', '@mux', 'cli'));
    }
  }

  return uniquePaths(roots);
}

export function resolveEmbeddedDocsPaths(
  execPath = process.execPath,
  cwd = process.cwd(),
): EmbeddedDocsPaths | null {
  for (const rootPath of getCandidateRoots(execPath, cwd)) {
    const skillPath = join(rootPath, 'skill', 'SKILL.md');
    const docsPath = join(rootPath, 'docs', 'guides');

    if (!existsSync(skillPath) || !existsSync(docsPath)) {
      continue;
    }

    const agentsPath = join(rootPath, 'AGENTS.md');

    return {
      rootPath,
      skillPath,
      docsPath,
      agentsPath: existsSync(agentsPath) ? agentsPath : null,
    };
  }

  return null;
}
