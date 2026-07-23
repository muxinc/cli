import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { EMBEDDED_SKILLS } from './embedded-skills.gen.ts';
import { getSkillsDir } from './xdg.ts';

export { EMBEDDED_SKILLS };

export interface SkillsManifest {
  source: string;
  commit: string;
}

export interface SkillEntry {
  name: string;
  path: string;
}

export interface MaterializedSkills {
  dir: string;
  files: string[];
}

/**
 * Parse the manifest recording which muxinc/mux-skills commit the embedded
 * skills were synced from.
 */
export function getSkillsManifest(): SkillsManifest {
  return JSON.parse(EMBEDDED_SKILLS['manifest.json']) as SkillsManifest;
}

/**
 * List the embedded skills by name with the relative path to each SKILL.md.
 */
export function listSkills(): SkillEntry[] {
  return Object.keys(EMBEDDED_SKILLS)
    .filter((path) => path.endsWith('/SKILL.md'))
    .map((path) => ({ name: dirname(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Write the embedded skill files to disk so agents can read them.
 * Existing files are overwritten so the on-disk copy always matches the
 * installed CLI version.
 */
export async function materializeSkills(
  targetDir: string = getSkillsDir(),
): Promise<MaterializedSkills> {
  const files: string[] = [];
  for (const [relative, contents] of Object.entries(EMBEDDED_SKILLS)) {
    const destination = join(targetDir, relative);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
    files.push(destination);
  }
  return { dir: targetDir, files };
}

/**
 * Default agent skills directory: ~/.claude/skills, which Claude Code loads
 * automatically at session start.
 */
export function getDefaultAgentSkillsDir(): string {
  return join(homedir(), '.claude', 'skills');
}

/**
 * True if a previous `mux skills install` left a copy of any embedded skill
 * in the target directory.
 */
export function hasInstalledSkills(
  targetDir: string = getDefaultAgentSkillsDir(),
): boolean {
  return listSkills().some((skill) => existsSync(join(targetDir, skill.path)));
}

/**
 * Install the embedded skills into an agent's skills directory (for example
 * ~/.claude/skills, which Claude Code loads automatically). Writes only the
 * skill directories, not the sync manifest, so the target directory contains
 * nothing but skills.
 */
export async function installSkills(
  targetDir: string,
): Promise<MaterializedSkills> {
  const files: string[] = [];
  for (const [relative, contents] of Object.entries(EMBEDDED_SKILLS)) {
    if (relative === 'manifest.json') continue;
    const destination = join(targetDir, relative);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
    files.push(destination);
  }
  return { dir: targetDir, files };
}
