import { createInterface } from 'node:readline';

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

  return new Promise((resolve) => {
    rl.question(`${options.message}${defaultSuffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || options.default || '');
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

  return new Promise((resolve) => {
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

    stdin.on('data', onData);
  });
}

export async function confirmPrompt(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  const rl = createReadlineInterface();
  const defaultValue = options.default ?? false;
  const hint = defaultValue ? '(Y/n)' : '(y/N)';

  return new Promise((resolve) => {
    rl.question(`${options.message} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}
