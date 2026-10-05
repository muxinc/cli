import { writeFileSync } from 'node:fs';
import {
  continueCommand,
  loadDirectives,
  type MigrationDeps,
  type PlanSummary,
  planMigration,
  type RunOptions,
  retryErrored,
  runMigration,
} from './engine.ts';
import { MigrationFailure } from './errors.ts';
import { ExitCode, type ExitCodeValue } from './exit-codes.ts';
import { buildMapping, mappingToCsv } from './export.ts';
import { parseDuration, type Recipe, recipeHash } from './recipe.ts';
import { summarizeStatus } from './status.ts';
import type { ItemState, MigrationError, RunEvent } from './types.ts';
import { verifyMigration } from './verify.ts';

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

const RUN_COMMAND = 'mux migrate run --yes';

function printError(io: MigrateIO, error: MigrationError): void {
  if (io.json) {
    io.out(JSON.stringify({ type: 'error', ...error }));
    return;
  }
  io.err(`Error [${error.code}]: ${error.message}`);
  if (error.hint) io.err(`Hint: ${error.hint}`);
  if (error.next_command) io.err(`Next: ${error.next_command}`);
}

/** Configuration and input problems exit 2; anything unexpected exits 1. */
function handleFailure(
  io: MigrateIO,
  error: unknown,
  nextCommand?: string,
): ExitCodeValue {
  if (error instanceof MigrationFailure) {
    printError(io, error.toJSON());
    return ExitCode.Usage;
  }
  printError(io, {
    code: 'UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : String(error),
    ...(nextCommand && { next_command: nextCommand }),
  });
  return ExitCode.Failed;
}

function renderRunEvent(io: MigrateIO, event: RunEvent): void {
  if (io.json) {
    io.out(JSON.stringify(event));
    return;
  }
  switch (event.type) {
    case 'item':
      if (event.state === 'ready') {
        io.out(`ready    ${event.source_id}  asset ${event.asset_id}`);
      } else if (event.state === 'errored') {
        io.out(`errored  ${event.source_id}  ${event.error?.message ?? ''}`);
      }
      return;
    case 'warning':
      io.err(`Warning [${event.code}]: ${event.message}`);
      if (event.next_command) io.err(`Next: ${event.next_command}`);
      return;
    case 'summary':
      io.out('');
      io.out(
        `Ready: ${event.ready}  Errored: ${event.errored}  Skipped: ${event.skipped}  Remaining: ${event.remaining}`,
      );
      if (event.duplicates > 0) io.out(`Duplicates: ${event.duplicates}`);
      if (event.next_command) io.out(`Next: ${event.next_command}`);
      return;
  }
}

function parseIds(ids: string | undefined): string[] | undefined {
  const list = ids
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return list?.length ? list : undefined;
}

function assetSettings(flags: RunFlags, recipe?: Recipe): RunOptions['asset'] {
  const playbackPolicies =
    flags.playbackPolicy ?? recipe?.asset?.playback_policy;
  const videoQuality = flags.videoQuality ?? recipe?.asset?.video_quality;
  const maxResolutionTier =
    flags.maxResolutionTier ?? recipe?.asset?.max_resolution_tier;
  return {
    ...(playbackPolicies && { playback_policies: playbackPolicies }),
    ...(videoQuality && { video_quality: videoQuality }),
    ...(maxResolutionTier && { max_resolution_tier: maxResolutionTier }),
    ...(flags.test && { test: true }),
  };
}

function formatDurationSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function printPlan(io: MigrateIO, plan: PlanSummary): void {
  if (io.json) {
    io.out(JSON.stringify({ type: 'plan', ...plan }));
    return;
  }
  io.out(
    `Found ${plan.total} item(s): ${plan.exportable} to migrate, ${plan.skipped} skipped (${plan.added} new).`,
  );
  const types = Object.entries(plan.by_type).map(([type, n]) => `${n} ${type}`);
  if (types.length > 0) io.out(`  Types: ${types.join(', ')}`);
  for (const [reason, n] of Object.entries(plan.skip_reasons)) {
    io.out(`  Skipped: ${n} (${reason})`);
  }
  if (plan.duration_seconds !== null) {
    io.out(`  Total duration: ${formatDurationSeconds(plan.duration_seconds)}`);
  }
  if (plan.size_bytes !== null) {
    io.out(`  Total size: ${(plan.size_bytes / 1e9).toFixed(2)} GB`);
  }
  const { original, rendition, unknown } = plan.fidelity;
  io.out(
    `  Fidelity: ${original} original, ${rendition} rendition, ${unknown} unknown`,
  );
  const captions = Object.entries(plan.captions).map(
    ([lang, n]) => `${lang} (${n})`,
  );
  if (captions.length > 0) io.out(`  Captions: ${captions.join(', ')}`);
  for (const directive of plan.directives) {
    io.out(
      `  Directive ${directive.name} (${directive.id}): ${directive.workflows.join(', ')} on ${directive.items} item(s)`,
    );
  }
  for (const warning of plan.warnings) {
    io.err(`Warning [${warning.code}]: ${warning.message}`);
    if (warning.hint) io.err(`Hint: ${warning.hint}`);
  }
  io.out(`  Nothing is billed by planning. Pricing: ${plan.pricing_url}`);
}

export async function executePlan(ctx: MigrateContext): Promise<ExitCodeValue> {
  const { deps, io } = ctx;
  try {
    const verified = await deps.provider.verify(deps.credentials);
    if (!verified.ok) {
      printError(io, verified.warnings[0]);
      return ExitCode.Usage;
    }
    const loaded = await loadDirectives(deps.mux, ctx.recipe?.directives ?? []);
    if ('error' in loaded) {
      printError(io, loaded.error);
      return ExitCode.Usage;
    }
    const plan = await planMigration(deps, { directives: loaded.directives });
    plan.warnings.unshift(...verified.warnings);
    if (io.json) {
      io.out(JSON.stringify(plan, null, 2));
    } else {
      printPlan(io, plan);
      io.out(`Next: ${RUN_COMMAND}`);
    }
    return ExitCode.Success;
  } catch (error) {
    return handleFailure(io, error);
  }
}

export async function executeRun(
  flags: RunFlags,
  ctx: MigrateContext,
): Promise<ExitCodeValue> {
  const { io, recipe } = ctx;
  let timeBudgetMs: number | undefined;
  try {
    timeBudgetMs =
      flags.timeBudget === undefined
        ? undefined
        : parseDuration(flags.timeBudget);
  } catch (error) {
    return handleFailure(io, error);
  }

  const options: RunOptions = {
    confirmed: Boolean(flags.yes),
    limit: flags.limit,
    ids: parseIds(flags.ids),
    timeBudgetMs,
    concurrency: flags.concurrency,
    wait: flags.wait,
    directives: flags.directive?.length ? flags.directive : recipe?.directives,
    skipRobots: flags.skipRobots,
    asset: assetSettings(flags, recipe),
    recipeHash: recipe ? recipeHash(recipe) : undefined,
  };
  const deps = {
    ...ctx.deps,
    emit: (event: RunEvent) => renderRunEvent(io, event),
  };

  let result: Awaited<ReturnType<typeof runMigration>>;
  try {
    result = await runMigration(deps, options);
  } catch (error) {
    return handleFailure(
      io,
      error,
      continueCommand({ ...options, confirmed: true }),
    );
  }

  if (result.error) printError(io, result.error);
  if (!options.confirmed && result.plan) {
    printPlan(io, result.plan);
    renderRunEvent(io, {
      type: 'summary',
      ready: result.ready,
      errored: result.errored,
      skipped: result.skipped,
      remaining: result.remaining,
      duplicates: 0,
      ...(result.nextCommand && { next_command: result.nextCommand }),
    });
  }
  return result.exitCode;
}

export function executeStatus(
  ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  const { io } = ctx;
  const report = summarizeStatus(ctx.deps.state);
  if (io.json) {
    io.out(JSON.stringify(report, null, 2));
    return report.exit_code;
  }

  if (!report.migration_id) {
    io.out('No migration found in this state file.');
  } else {
    io.out(`Migration ${report.migration_id} (${report.provider})`);
    for (const [state, count] of Object.entries(report.counts)) {
      if (count > 0) io.out(`  ${state.padEnd(11)} ${count}`);
    }
    if (report.in_flight.length > 0) {
      io.out('Oldest in-flight items:');
      for (const item of report.in_flight) {
        io.out(`  ${item.source_id}  ${item.state} since ${item.since}`);
      }
    }
    if (report.errored.length > 0) {
      io.out('Errored items:');
      for (const { source_id, error } of report.errored) {
        io.out(`  ${source_id}  [${error.code}] ${error.message}`);
      }
    }
  }
  if (report.next_command) io.out(`Next: ${report.next_command}`);
  return report.exit_code;
}

export function executeRetry(
  flags: { ids?: string },
  ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  const requeued = retryErrored(ctx.deps.state, parseIds(flags.ids));
  if (ctx.io.json) {
    ctx.io.out(
      JSON.stringify({ requeued, next_command: RUN_COMMAND }, null, 2),
    );
  } else {
    ctx.io.out(`Re-queued ${requeued} errored item(s).`);
    ctx.io.out(`Next: ${RUN_COMMAND}`);
  }
  return ExitCode.Success;
}

export function executeExport(
  flags: { format?: 'json' | 'csv'; include?: ItemState[]; output?: string },
  ctx: Pick<MigrateContext, 'deps' | 'io'>,
): ExitCodeValue {
  const { io } = ctx;
  let content: string;
  try {
    const mapping = buildMapping(ctx.deps.state, {
      include: flags.include?.length ? flags.include : ['ready'],
      now: new Date(ctx.deps.clock.now()),
    });
    content =
      flags.format === 'csv'
        ? mappingToCsv(mapping)
        : JSON.stringify(mapping, null, 2);
    if (flags.output) {
      writeFileSync(
        flags.output,
        content.endsWith('\n') ? content : `${content}\n`,
      );
      const summary = { output: flags.output, items: mapping.items.length };
      io.out(
        io.json
          ? JSON.stringify(summary, null, 2)
          : `Wrote ${summary.items} item(s) to ${summary.output}.`,
      );
      return ExitCode.Success;
    }
  } catch (error) {
    return handleFailure(io, error);
  }
  io.out(content.trimEnd());
  return ExitCode.Success;
}

export async function executeVerify(
  flags: { ids?: string },
  ctx: Pick<MigrateContext, 'deps' | 'io'> & { fetch?: typeof fetch },
): Promise<ExitCodeValue> {
  const { io } = ctx;
  let report: Awaited<ReturnType<typeof verifyMigration>>;
  try {
    report = await verifyMigration(
      {
        state: ctx.deps.state,
        mux: ctx.deps.mux,
        clock: ctx.deps.clock,
        fetch: ctx.fetch,
      },
      { ids: parseIds(flags.ids) },
    );
  } catch (error) {
    return handleFailure(io, error, 'mux migrate verify');
  }
  if (io.json) {
    io.out(JSON.stringify(report, null, 2));
    return report.exit_code;
  }
  io.out(
    `Verified ${report.checked} item(s): ${report.passed} passed, ${report.failed.length} failed.`,
  );
  for (const item of report.failed) {
    io.out(`  ${item.source_id}  ${item.asset_id ?? ''}`);
    for (const check of item.checks)
      io.out(`    ${check.name}: ${check.message ?? 'failed'}`);
  }
  for (const duplicate of report.duplicates) {
    io.out(
      `  Duplicate asset ${duplicate.duplicateAssetId} for ${duplicate.sourceId} (kept ${duplicate.keptAssetId}). Remove it with: mux assets delete ${duplicate.duplicateAssetId}`,
    );
  }
  if (report.next_command) io.out(`Next: ${report.next_command}`);
  return report.exit_code;
}
