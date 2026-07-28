import { createInterface } from 'node:readline';

export const STDIN_CLOSED_MESSAGE =
  'Interactive input required but stdin is closed. Provide the value via flags or environment variables (e.g. --force, -y), or run in an interactive terminal.';

function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stderr,
  });
}

export async function inputPrompt(options: {
  message: string;
  default?: string;
}): Promise<string> {
  const rl = createReadlineInterface();
  const defaultSuffix = options.default ? ` (${options.default})` : '';

  return new Promise((resolve, reject) => {
    let answered = false;
    rl.question(`${options.message}${defaultSuffix} `, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim() || options.default || '');
    });
    // EOF (piped or closed stdin) fires 'close' without an answer; without
    // this handler the promise never settles and the process hangs.
    rl.on('close', () => {
      if (!answered) reject(new Error(STDIN_CLOSED_MESSAGE));
    });
  });
}

export async function secretPrompt(options: {
  message: string;
}): Promise<string> {
  const rl = createReadlineInterface();

  // Mute output to hide the secret as it's typed
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }

  return new Promise((resolve, reject) => {
    let input = '';
    process.stderr.write(`${options.message} `);

    const onData = (char: Buffer) => {
      const str = char.toString();

      if (str === '\n' || str === '\r' || str === '\u0004') {
        // Enter or Ctrl+D
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdin.removeListener('data', onData);
        stdin.removeListener('end', onEnd);
        process.stderr.write('\n');
        rl.close();
        resolve(input);
      } else if (str === '\u0003') {
        // Ctrl+C
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdin.removeListener('data', onData);
        rl.close();
        process.exit(130);
      } else if (str === '\u007F' || str === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else {
        input += str;
      }
    };

    // EOF without any input (piped or closed stdin) must fail loudly
    // rather than leave the promise unsettled and the process hung.
    const onEnd = () => {
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.removeListener('data', onData);
      rl.close();
      reject(new Error(STDIN_CLOSED_MESSAGE));
    };

    stdin.on('data', onData);
    stdin.once('end', onEnd);
  });
}

export async function confirmPrompt(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  const rl = createReadlineInterface();
  const defaultValue = options.default ?? false;
  const hint = defaultValue ? '(Y/n)' : '(y/N)';

  return new Promise((resolve, reject) => {
    let answered = false;
    rl.question(`${options.message} ${hint} `, (answer) => {
      answered = true;
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
    // EOF must fail loudly rather than hang (or silently decline): a script
    // that meant to confirm should learn to pass --force / -y.
    rl.on('close', () => {
      if (!answered) reject(new Error(STDIN_CLOSED_MESSAGE));
    });
  });
}
