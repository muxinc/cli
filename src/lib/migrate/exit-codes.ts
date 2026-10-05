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
export function resolveExitCode(_outcome: Outcome): ExitCodeValue {
  throw new Error('Not implemented');
}
