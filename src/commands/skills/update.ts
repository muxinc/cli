import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import pkg from '../../../package.json';
import {
  getDefaultAgentSkillsDir,
  getSkillsManifest,
  hasInstalledSkills,
  installSkills,
  materializeSkills,
} from '../../lib/embedded-skills.ts';
import {
  compareSemver,
  detectInstallMethod,
  fetchLatestVersion,
  getUpgradeCommand,
} from '../../lib/update-notifier.ts';

interface SkillsUpdateOptions {
  json?: boolean;
}

export const skillsUpdateCommand = new Command()
  .description(
    'Refresh local skill copies from this CLI build and check for newer releases.\n\nSkills ship with the CLI, so the freshest copy comes from upgrading the CLI itself. This command rewrites the data-directory copy (and ~/.claude/skills, if installed) to match the installed CLI version, then reports when a newer release is available.',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: SkillsUpdateOptions) => {
    try {
      const { dir } = await materializeSkills();
      const manifest = getSkillsManifest();

      const agentSkillsDir = getDefaultAgentSkillsDir();
      const installed = hasInstalledSkills(agentSkillsDir);
      if (installed) {
        await installSkills(agentSkillsDir);
      }

      const latestVersion =
        pkg.version === '0.0.0' ? null : await fetchLatestVersion();
      const updateAvailable =
        latestVersion !== null && compareSemver(latestVersion, pkg.version) > 0;

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              skills_dir: dir,
              installed_dir: installed ? agentSkillsDir : null,
              source: manifest,
              cli_version: pkg.version,
              latest_cli_version: latestVersion,
              update_available: updateAvailable,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`Refreshed skills at ${dir}`);
      if (installed) {
        console.log(`Refreshed installed skills at ${agentSkillsDir}`);
      } else {
        console.log(
          `No copy found in ${agentSkillsDir} — run \`mux skills install\` to enable automatic loading in Claude Code.`,
        );
      }
      console.log(
        `Synced from ${manifest.source}@${manifest.commit.slice(0, 7)} (ships with CLI ${pkg.version})`,
      );

      if (updateAvailable) {
        const command = getUpgradeCommand(detectInstallMethod());
        console.log('');
        console.log(
          `A newer CLI release (${latestVersion}) is available and may include updated skills.`,
        );
        console.log(`Run \`${command}\`, then \`mux skills update\` again.`);
      } else if (latestVersion !== null) {
        console.log('You are on the latest CLI release.');
      }
    } catch (error) {
      await handleCommandError(error, 'skills', 'update', options);
    }
  });
