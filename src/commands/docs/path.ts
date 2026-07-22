import { join } from 'node:path';
import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import {
  getSkillsManifest,
  listSkills,
  materializeSkills,
} from '../../lib/embedded-skills.ts';

interface DocsPathOptions {
  json?: boolean;
}

export const docsPathCommand = new Command()
  .description(
    'Write the agent skills embedded in this CLI build to the Mux data directory and print their paths',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DocsPathOptions) => {
    try {
      const { dir } = await materializeSkills();
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

      console.log(`Skills directory:  ${dir}`);
      console.log(
        `Synced from:       ${manifest.source}@${manifest.commit.slice(0, 7)}`,
      );
      console.log('');
      for (const skill of skills) {
        console.log(`  ${skill.name.padEnd(14)} ${skill.path}`);
      }
    } catch (error) {
      await handleCommandError(error, 'docs', 'path', options);
    }
  });
