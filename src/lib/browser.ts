/**
 * Open a URL in the user's default browser.
 */

/**
 * The command used to hand a URL to the platform's default browser.
 *
 * Exported for tests: the Windows form is easy to get wrong and impossible to
 * verify from a POSIX machine, so at least the argument vector is pinned down.
 */
export function browserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  switch (platform) {
    case 'darwin':
      return ['open', url];

    case 'win32':
      // Deliberately not `cmd /c start`: cmd.exe treats `&` as a command
      // separator, and an authorization URL always contains `&` between query
      // parameters, so the browser would receive a truncated URL (and the rest
      // would be run as commands). Quoting it away is unreliable here because
      // Bun offers no way to bypass its own argument escaping on Windows.
      //
      // rundll32 hands the URL straight to the registered protocol handler —
      // the default browser — with no shell in the path to reinterpret it.
      return ['rundll32', 'url.dll,FileProtocolHandler', url];

    default:
      return ['xdg-open', url];
  }
}

/**
 * Returns false rather than throwing when no browser could be launched —
 * headless hosts, restricted environments, and SSH sessions are expected, and
 * the caller falls back to printing the URL.
 */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(browserCommand(url), {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
