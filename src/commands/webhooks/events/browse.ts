import { Command } from '@cliffy/command';
import { updateEnvironment } from '@/lib/config.ts';
import { resolveActiveEnvironment } from '@/lib/mux.ts';

export const browseCommand = new Command()
  .description('Interactively browse, filter, and replay stored webhook events')
  .option(
    '--forward-to <url:string>',
    'Enable replaying events to a local URL (remembered per environment)',
  )
  .action(async (options) => {
    try {
      if (!process.stdout.isTTY) {
        console.error(
          'Error: The browse command requires an interactive terminal.\n' +
            "Use 'mux webhooks events list' for non-interactive output.",
        );
        process.exit(1);
      }

      const active = await resolveActiveEnvironment();
      const environmentId = active.environmentId;

      // Use provided --forward-to, or fall back to the saved URL
      const forwardTo =
        options.forwardTo ?? active.stored?.environment.forwardUrl;

      // Save the forward URL if a new one was provided. Only persisted when
      // the stored environment matches the active credentials.
      if (
        options.forwardTo &&
        active.stored &&
        options.forwardTo !== active.stored.environment.forwardUrl
      ) {
        await updateEnvironment(active.stored.name, {
          forwardUrl: options.forwardTo,
        });
      }

      const { createCliRenderer } = await import('@opentui/core');
      const { createRoot } = await import('@opentui/react');
      const { EventsBrowserApp } = await import('./EventsBrowserApp.tsx');
      const React = await import('react');

      const renderer = await createCliRenderer({ exitOnCtrlC: true });
      const root = createRoot(renderer);

      root.render(
        React.createElement(EventsBrowserApp, {
          environmentId,
          signingSecretKey: active.stored?.name ?? active.environmentId,
          forwardTo,
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });
