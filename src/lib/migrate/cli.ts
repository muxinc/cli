import type { MigrationDeps } from './engine.ts';
import type { ExitCodeValue } from './exit-codes.ts';
import type { Recipe } from './recipe.ts';
import type { ItemState } from './types.ts';

/** Where command output goes. JSON mode prints machine-readable lines only. */
export interface MigrateIO {
  json: boolean;
  out(line: string): void;
  err(line: string): void;
}

export interface MigrateContext {
  deps: MigrationDeps<unknown>;
  recipe?: Recipe;
  io: MigrateIO;
}

export interface RunFlags {
  yes?: boolean;
  limit?: number;
  ids?: string;
  timeBudget?: string;
  concurrency?: number;
  /** False with --no-wait. */
  wait?: boolean;
  directive?: string[];
  skipRobots?: boolean;
  playbackPolicy?: Array<'public' | 'signed' | 'drm'>;
  videoQuality?: 'basic' | 'plus' | 'premium';
  maxResolutionTier?: '1080p' | '1440p' | '2160p';
  test?: boolean;
}

export async function executePlan(
  _ctx: MigrateContext,
): Promise<ExitCodeValue> {
  throw new Error('Not implemented');
}

export async function executeRun(
  _flags: RunFlags,
  _ctx: MigrateContext,
): Promise<ExitCodeValue> {
  throw new Error('Not implemented');
}

export function executeStatus(
  _ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  throw new Error('Not implemented');
}

export function executeRetry(
  _flags: { ids?: string },
  _ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  throw new Error('Not implemented');
}

export function executeExport(
  _flags: { format?: 'json' | 'csv'; include?: ItemState[] },
  _ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  throw new Error('Not implemented');
}
