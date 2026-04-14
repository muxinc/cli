import { Command } from '@cliffy/command';
import {
  detectShell,
  getCompletionLine,
  getRcFilePath,
  installCompletions,
} from '../lib/completions.ts';

export const completionsInstallCommand = new Command()
  .description(
    'Install shell completions by adding the source line to your shell config file',
  )
  .option(
    '-s, --shell <shell:string>',
    'Shell to install for (zsh, bash, fish)',
  )
  .action(async (options) => {
    const shell = options.shell ?? detectShell();

    if (!shell) {
      throw new Error(
        'Could not detect your shell. Please specify one with --shell (zsh, bash, fish).',
      );
    }

    if (!['zsh', 'bash', 'fish'].includes(shell)) {
      throw new Error(
        `Unsupported shell: ${shell}. Supported shells: zsh, bash, fish.`,
      );
    }

    const rcPath = getRcFilePath(shell as 'zsh' | 'bash' | 'fish');
    const result = await installCompletions(shell as 'zsh' | 'bash' | 'fish');

    if (result.alreadyInstalled) {
      console.log(`Shell completions already configured in ${rcPath}`);
      return;
    }

    console.log(
      `✅ Added \`${getCompletionLine(shell as 'zsh' | 'bash' | 'fish')}\` to ${rcPath}`,
    );
    console.log(`   Restart your shell or run: source ${rcPath}`);
  });
