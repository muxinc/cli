import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import {
  downloadAndExtractDocs,
  fetchRemoteDocsVersion,
  getDocsUpdateTargetDir,
  isDocsUpdateAvailable,
  readLocalDocsVersion,
} from '../../lib/docs-update.ts';
import { resolveEmbeddedDocsPaths } from '../../lib/embedded-docs.ts';
import { detectInstallMethod } from '../../lib/update-notifier.ts';

export const updateCommand = new Command()
  .description('Download the latest Mux documentation')
  .option('--check', 'Check for newer docs without downloading')
  .action(async (options: { check?: boolean }) => {
    const paths = resolveEmbeddedDocsPaths();
    const localRootPath = paths?.rootPath;
    const local = localRootPath
      ? await readLocalDocsVersion(localRootPath)
      : null;

    const remote = await fetchRemoteDocsVersion();
    if (!remote) {
      console.error(
        'Could not check for docs updates. Please try again later.',
      );
      process.exit(1);
    }

    if (options.check) {
      if (isDocsUpdateAvailable(local, remote)) {
        const localDate = local?.date ?? 'unknown';
        console.log(
          `Newer docs available: ${colors.dim(localDate)} → ${colors.green(remote.date)}`,
        );
        console.log(`Run \`${colors.cyan('mux docs update')}\` to download.`);
        process.exit(1);
      }
      console.log(`${colors.green('Docs are up to date.')} (${remote.date})`);
      return;
    }

    // Update mode
    if (!isDocsUpdateAvailable(local, remote)) {
      console.log(
        `${colors.green('Docs are already up to date.')} (${remote.date})`,
      );
      return;
    }

    const installMethod = detectInstallMethod();
    const currentRoot = localRootPath ?? '';
    const targetDir = getDocsUpdateTargetDir(installMethod, currentRoot);

    console.log('Downloading latest docs...');
    try {
      await downloadAndExtractDocs(targetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to update docs: ${message}`);
      process.exit(1);
    }

    console.log(
      `${colors.green('Docs updated successfully.')} (${remote.date})`,
    );
    console.log(`Location: ${colors.dim(targetDir)}`);

    if (installMethod !== 'shell' && localRootPath) {
      console.log(
        colors.dim(
          `Note: Updated docs stored in ${targetDir} and will take precedence over the bundled copy.`,
        ),
      );
    }
  });
