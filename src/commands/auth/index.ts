import { Command } from '@cliffy/command';
import { loginCommand } from '../login.ts';
import { logoutCommand } from '../logout.ts';
import { statusCommand } from './status.ts';

export const authCommand = new Command()
  .description('Inspect and manage Mux credentials')
  .action(function () {
    this.showHelp();
  })
  .command('status', statusCommand)
  // Aliases of the top-level commands, so `mux auth login` works for anyone who
  // reaches for it after running `mux auth status`.
  .command('login', loginCommand)
  .command('logout', logoutCommand);
