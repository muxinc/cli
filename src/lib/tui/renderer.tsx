/** @jsxImportSource @opentui/react */
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import type { ReactNode } from 'react';

export interface TUIOptions {
  exitOnCtrlC?: boolean;
}

/**
 * Render a TUI application to the terminal
 * Returns a cleanup function to unmount the app
 */
export async function renderTUI(
  element: ReactNode,
  options: TUIOptions = {},
): Promise<() => void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: options.exitOnCtrlC ?? true,
  });

  const root = createRoot(renderer);
  root.render(element);

  return () => {
    renderer.destroy();
  };
}

/**
 * Run a TUI application and wait for it to exit
 * Useful for commands that should block until the TUI is closed
 */
export async function runTUI(
  element: ReactNode,
  options: TUIOptions = {},
): Promise<void> {
  const cleanup = await renderTUI(element, options);

  // Keep the process running until explicitly exited
  await new Promise<void>(() => {
    // This promise never resolves - the TUI will call process.exit when done
  });

  cleanup();
}
