import { mkdir, writeFile } from 'node:fs/promises';
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
 * Parse the manifest recording which muxinc/skills commit the embedded
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
