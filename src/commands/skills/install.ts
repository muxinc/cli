import { join } from 'node:path';
import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import {
  getDefaultAgentSkillsDir,
  getSkillsManifest,
  installSkills,
  listSkills,
} from '../../lib/embedded-skills.ts';

interface DocsInstallOptions {
  dir: string;
  json?: boolean;
}

export const skillsInstallCommand = new Command()
  .description(
    'Install the embedded agent skills into an agent skills directory.\n\nDefaults to ~/.claude/skills, which Claude Code loads automatically — no CLAUDE.md or AGENTS.md changes needed. Run `mux skills update` after upgrading the CLI to refresh the installed copy.',
  )
  .option('--dir <path:string>', 'Target skills directory', {
    default: getDefaultAgentSkillsDir(),
  })
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DocsInstallOptions) => {
    try {
      const { dir } = await installSkills(options.dir);
      const manifest = getSkillsManifest();
      const skills = listSkills().map((skill) => ({
        name: skill.name,
        path: join(dir, skill.path),
      }));

      if (options.json) {
        console.log(
          JSON.stringify(
            { skills_dir: dir, source: manifest, skills },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`Installed ${skills.length} agent skills to ${dir}`);
      console.log(
        `Synced from:  ${manifest.source}@${manifest.commit.slice(0, 7)}`,
      );
      console.log('');
      for (const skill of skills) {
        console.log(`  ${skill.name}`);
      }
      console.log('');
      console.log(
        'Claude Code loads these automatically in new sessions. Run `mux skills update` after upgrading the CLI to refresh this copy.',
      );
    } catch (error) {
      await handleCommandError(error, 'skills', 'install', options);
    }
  });
