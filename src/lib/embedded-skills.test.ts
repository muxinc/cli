import { describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMBEDDED_SKILLS,
  getSkillsManifest,
  installSkills,
  listSkills,
  materializeSkills,
} from './embedded-skills.ts';

describe('embedded skills', () => {
  it('includes the docs discovery skill', () => {
    expect(Object.keys(EMBEDDED_SKILLS)).toContain('mux-docs/SKILL.md');
  });

  it('includes a manifest recording the source repository', () => {
    const manifest = getSkillsManifest();
    expect(manifest.source).toBe('muxinc/skills');
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('stays in sync with the skill/ directory', async () => {
    const skillDir = join(import.meta.dir, '..', '..', 'skill');
    const entries = await readdir(skillDir, {
      recursive: true,
      withFileTypes: true,
    });
    const onDisk: Record<string, string> = {};
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolute = join(entry.parentPath, entry.name);
      const relative = absolute.slice(skillDir.length + 1);
      onDisk[relative] = await Bun.file(absolute).text();
    }
    expect(EMBEDDED_SKILLS).toEqual(onDisk);
  });

  it('lists each skill with its SKILL.md path', () => {
    const skills = listSkills();
    const names = skills.map((skill) => skill.name);
    expect(names).toContain('mux');
    expect(names).toContain('mux-docs');
    for (const skill of skills) {
      expect(skill.path).toBe(`${skill.name}/SKILL.md`);
    }
  });
});

describe('materializeSkills', () => {
  it('writes every embedded file into the target directory', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'mux-cli-skills-test-'));
    try {
      const { dir, files } = await materializeSkills(testDir);
      expect(dir).toBe(testDir);
      expect(files.length).toBe(Object.keys(EMBEDDED_SKILLS).length);
      for (const [relative, contents] of Object.entries(EMBEDDED_SKILLS)) {
        expect(await Bun.file(join(testDir, relative)).text()).toBe(contents);
      }
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('installs skill directories without the sync manifest', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'mux-cli-skills-test-'));
    try {
      const { files } = await installSkills(testDir);
      expect(files.length).toBe(Object.keys(EMBEDDED_SKILLS).length - 1);
      expect(await Bun.file(join(testDir, 'manifest.json')).exists()).toBe(
        false,
      );
      expect(
        await Bun.file(join(testDir, 'mux-docs', 'SKILL.md')).exists(),
      ).toBe(true);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('overwrites stale files from a previous CLI version', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'mux-cli-skills-test-'));
    try {
      await materializeSkills(testDir);
      const skillPath = join(testDir, 'mux-docs', 'SKILL.md');
      await Bun.write(skillPath, 'stale contents from an old version');
      await materializeSkills(testDir);
      expect(await Bun.file(skillPath).text()).toBe(
        EMBEDDED_SKILLS['mux-docs/SKILL.md'],
      );
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});
