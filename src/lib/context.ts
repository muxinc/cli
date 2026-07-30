let agentMode = false;
let jsonFlag = false;

export function setAgentMode(value: boolean) {
  agentMode = value;
}

export function isAgentMode(): boolean {
  return agentMode;
}

export function setJsonFlag(value: boolean) {
  jsonFlag = value;
}

/**
 * Whether --json appeared anywhere in argv. Lets process-wide notices that
 * cannot see per-command options (e.g. the env credential shadow warning)
 * stay off stderr when output is meant to be machine-readable.
 */
export function hasJsonFlag(): boolean {
  return jsonFlag;
}

/**
 * Whether a command should produce machine-readable JSON output.
 * True when the command was invoked with --json or when agent mode is active.
 */
export function wantsJson(options: { json?: boolean }): boolean {
  return Boolean(options.json) || agentMode;
}

/**
 * Preprocess argv to handle the --agent flag before Cliffy parses it.
 * Strips --agent from args and enables agent mode. Commands consult
 * agent mode via wantsJson()/isAgentMode() to decide output format, so
 * no --json flag is injected and commands without one still work.
 */
export function preprocessArgs(argv: string[]): string[] {
  if (argv.includes('--json')) {
    setJsonFlag(true);
  }

  const agentIndex = argv.indexOf('--agent');
  if (agentIndex === -1) {
    return argv;
  }

  setAgentMode(true);
  return argv.filter((_, i) => i !== agentIndex);
}
