import { describe, expect, it } from 'bun:test';
import { browserCommand } from './browser.ts';

// A real authorization URL: several `&` separators and percent-encoding, which is
// what breaks naive Windows shell invocations.
const URL_WITH_AMPERSANDS =
  'https://api.mux.com/ui/v1/oauth/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A57460%2Fcallback&scope=video%3Aread+data%3Aread&state=XYZ&code_challenge=Q&code_challenge_method=S256';

describe('browserCommand', () => {
  it('uses open on macOS', () => {
    expect(browserCommand(URL_WITH_AMPERSANDS, 'darwin')).toEqual([
      'open',
      URL_WITH_AMPERSANDS,
    ]);
  });

  it('uses xdg-open elsewhere on POSIX', () => {
    expect(browserCommand(URL_WITH_AMPERSANDS, 'linux')).toEqual([
      'xdg-open',
      URL_WITH_AMPERSANDS,
    ]);
    expect(browserCommand(URL_WITH_AMPERSANDS, 'freebsd')[0]).toBe('xdg-open');
  });

  describe('on Windows', () => {
    it('does not route the URL through cmd.exe', () => {
      // cmd treats `&` as a command separator, so `cmd /c start <url>` opens a
      // truncated URL and runs the rest of the query string as commands.
      const command = browserCommand(URL_WITH_AMPERSANDS, 'win32');

      expect(command).not.toContain('cmd');
      expect(command).not.toContain('start');
    });

    it('hands the URL to the registered protocol handler', () => {
      expect(browserCommand(URL_WITH_AMPERSANDS, 'win32')).toEqual([
        'rundll32',
        'url.dll,FileProtocolHandler',
        URL_WITH_AMPERSANDS,
      ]);
    });
  });

  it('keeps the URL intact as a single argument on every platform', () => {
    // Whatever the platform, the URL must arrive as one argv entry with nothing
    // trimmed at the first `&`.
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      const command = browserCommand(URL_WITH_AMPERSANDS, platform);
      const urlArgs = command.filter((arg) => arg.includes('oauth/authorize'));

      expect(urlArgs).toEqual([URL_WITH_AMPERSANDS]);
      expect(urlArgs[0]).toContain('code_challenge_method=S256');
    }
  });

  it('never passes an empty argument that could be read as the URL', () => {
    // `cmd /c start "" <url>` needed a placeholder title argument; nothing does
    // now, and an empty argv entry would be a sign that crept back in.
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(browserCommand(URL_WITH_AMPERSANDS, platform)).not.toContain('');
    }
  });
});
