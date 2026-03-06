import { Command } from '@cliffy/command';
import { getCurrentEnvironment } from '@/lib/config.ts';

export const browseCommand = new Command()
  .description('Interactively browse, filter, and replay stored webhook events')
  .option('--forward-to <url:string>', 'Enable replaying events to a local URL')
  .action(async (options) => {
    try {
      if (!process.stdout.isTTY) {
        console.error(
          'Error: The browse command requires an interactive terminal.\n' +
            "Use 'mux webhooks events list' for non-interactive output.",
        );
        process.exit(1);
      }

      const env = await getCurrentEnvironment();
      if (!env) {
        console.error("Not logged in. Please run 'mux login' to authenticate.");
        process.exit(1);
      }

      const environmentId = env.environment.environmentId ?? env.name;

      const { createCliRenderer } = await import('@opentui/core');
      const { createRoot } = await import('@opentui/react');
      const { EventsBrowserApp } = await import('./EventsBrowserApp.tsx');
      const React = await import('react');

      const renderer = await createCliRenderer({ exitOnCtrlC: true });
      const root = createRoot(renderer);

      root.render(
        React.createElement(EventsBrowserApp, {
          environmentId,
          forwardTo: options.forwardTo,
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });
