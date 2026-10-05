export const ExitCode = {
  Success: 0,
  Failed: 1,
  Usage: 2,
  ConfirmationRequired: 3,
  WorkRemaining: 4,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface Outcome {
  usageError?: boolean;
  confirmationRequired?: boolean;
  commandFailed?: boolean;
  /** Items that a further `run` would still make progress on. */
  remaining: number;
  /** Errored items. Incomplete directive runs are warnings, reported by `verify`. */
  errored: number;
}

/** Applies the precedence in MIGRATE_SPEC.md "Output contract". */
export function resolveExitCode(outcome: Outcome): ExitCodeValue {
  if (outcome.usageError) return ExitCode.Usage;
  if (outcome.confirmationRequired) return ExitCode.ConfirmationRequired;
  if (outcome.commandFailed) return ExitCode.Failed;
  if (outcome.remaining > 0) return ExitCode.WorkRemaining;
  if (outcome.errored > 0) return ExitCode.Failed;
  return ExitCode.Success;
}
