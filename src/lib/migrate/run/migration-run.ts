import { resolveExitCode } from '../exit-codes.ts';
import { CaptionStage } from './captions.ts';
import { RunContext } from './context.ts';
import { AssetCreator } from './creator.ts';
import { AssetLifecycle } from './lifecycle.ts';
import { Reconciler } from './reconciler.ts';
import { continueCommand, tallyScope } from './shared.ts';
import type {
  MigrationDeps,
  PlanSummary,
  RunOptions,
  RunResult,
} from './types.ts';

/** One confirmed `mux migrate run`: creates, waits, and reports. */
export class MigrationRun<C> {
  private readonly ctx: RunContext<C>;
  private readonly lifecycle: AssetLifecycle<C>;
  private readonly captions: CaptionStage<C>;
  private readonly creator: AssetCreator<C>;
  private readonly reconciler: Reconciler<C>;
  private readonly controller = new AbortController();

  constructor(deps: MigrationDeps<C>, options: RunOptions) {
    this.ctx = new RunContext(deps, options);
    this.lifecycle = new AssetLifecycle(this.ctx);
    this.captions = new CaptionStage(this.ctx);
    this.creator = new AssetCreator(this.ctx, this.lifecycle, this.captions);
    this.reconciler = new Reconciler(this.ctx, this.lifecycle, this.captions);
  }

  async execute(plan: PlanSummary): Promise<RunResult> {
    const { ctx } = this;
    // The stream opens before anything is created, so no event is missed.
    const stream = await ctx.deps.events.open(this.controller.signal);
    const consuming = this.reconciler.consume(stream, this.controller.signal);
    const reconcileTimer = setInterval(() => {
      this.reconciler.reconcileQuietly();
    }, ctx.timing.reconcileIntervalMs);

    try {
      await this.reconciler.reconcile({ resume: true });
      await this.creator.createAll();
      if (ctx.options.wait !== false) await this.waitForProcessing();
      // Handle events that have already arrived, such as the created event
      // of a duplicate, before the stream is closed.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await this.captions.settle();
      ctx.throwIfFailed();
    } finally {
      clearInterval(reconcileTimer);
      this.controller.abort();
      ctx.changed();
      await consuming;
    }
    ctx.throwIfFailed();
    return this.finish(plan);
  }

  private async waitForProcessing(): Promise<void> {
    const { ctx } = this;
    while (true) {
      ctx.throwIfFailed();
      if (ctx.deadlinePassed()) return;
      const busy =
        ctx.inFlight.size > 0 ||
        ctx.state.count(['processing'], ctx.options.ids) > 0;
      if (!busy) return;

      const waits: Promise<void>[] = [ctx.nextChange()];
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (ctx.deadline !== undefined) {
        const remaining = Math.max(0, ctx.deadline - ctx.deps.clock.now());
        waits.push(
          new Promise((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        );
      }
      await Promise.race(waits);
      clearTimeout(timer);
    }
  }

  private finish(plan: PlanSummary): RunResult {
    const { ctx } = this;
    this.captions.reportPending();

    for (const record of ctx.state.list({ states: ['creating'] })) {
      if (!ctx.inScope(record.sourceId)) continue;
      ctx.warn({
        code: 'CREATE_OUTCOME_UNKNOWN',
        message: `The create request for ${record.sourceId} got no response. The next run checks whether the asset exists before creating it again.`,
        next_command: continueCommand(ctx.options),
      });
    }

    const tally = tallyScope(ctx.state, ctx.options.ids);
    const exitCode = resolveExitCode(tally);
    let nextCommand: string | undefined;
    if (tally.remaining > 0) nextCommand = continueCommand(ctx.options);
    else if (tally.errored > 0) nextCommand = 'mux migrate retry';

    const { duplicates } = this.lifecycle;
    ctx.deps.emit?.({
      type: 'summary',
      ...tally,
      duplicates: duplicates.length,
      ...(nextCommand && { next_command: nextCommand }),
    });
    return {
      exitCode,
      ...tally,
      duplicates,
      nextCommand,
      plan,
    };
  }
}
