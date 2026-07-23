let agentMode = false;

export function setAgentMode(value: boolean) {
  agentMode = value;
}

export function isAgentMode(): boolean {
  return agentMode;
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
  const agentIndex = argv.indexOf('--agent');
  if (agentIndex === -1) {
    return argv;
  }

  setAgentMode(true);
  return argv.filter((_, i) => i !== agentIndex);
}
