/**
 * Open a URL in the user's default browser.
 *
 * Returns false rather than throwing when no browser could be launched —
 * headless hosts, restricted environments, and SSH sessions are expected, and
 * the caller falls back to printing the URL.
 */
export async function openBrowser(url: string): Promise<boolean> {
  const command =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];

  try {
    const proc = Bun.spawn(command, {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
