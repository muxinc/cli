import type { MigrationError } from './types.ts';

/** An error with a stable code from the documented migrate error list. */
export class MigrationFailure extends Error implements MigrationError {
  code: string;
  hint?: string;
  next_command?: string;

  constructor(error: MigrationError) {
    super(error.message);
    this.name = 'MigrationFailure';
    this.code = error.code;
    this.hint = error.hint;
    this.next_command = error.next_command;
  }

  toJSON(): MigrationError {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint && { hint: this.hint }),
      ...(this.next_command && { next_command: this.next_command }),
    };
  }
}
