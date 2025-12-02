import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../../lib/mux.ts';

export const manageCommand = new Command()
  .description('Interactively manage Mux video assets with a TUI')
  .action(async () => {
    try {
      // Check if we're in a TTY
      if (!process.stdout.isTTY) {
        console.error(
          'Error: The manage command requires an interactive terminal.\n' +
            "Use 'mux assets list' for non-interactive output.",
        );
        process.exit(1);
      }

      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // Dynamic import to avoid loading TUI deps when not needed
      const { createCliRenderer } = await import('@opentui/core');
      const { createRoot } = await import('@opentui/react');
      const { AssetManageApp } = await import('./AssetManageApp.tsx');
      const React = await import('react');

      const renderer = await createCliRenderer({
        exitOnCtrlC: true,
      });

      const root = createRoot(renderer);
      root.render(React.createElement(AssetManageApp, { mux }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });
