import { ExternalIds } from '../external-id.ts';
import type { ItemPatch, ItemRecord, MigrationState } from '../state.ts';
import type { MigrationError } from '../types.ts';
import { DEFAULT_TIMING } from './shared.ts';
import type { MigrationDeps, RunOptions, RunTiming } from './types.ts';

/**
 * The state one run shares across its parts: the state file, the run's
 * scope and deadline, requests in flight, and the single way to change an
 * item's state and report it.
 */
export class RunContext<C> {
  readonly state: MigrationState;
  readonly timing: RunTiming;
  readonly externalIds: ExternalIds;
  /** The `--ids` selection, or undefined for the whole library. */
  readonly scope?: Set<string>;
  readonly migrationId: string;
  readonly deadline?: number;
  /** Items whose asset create request has not returned yet. */
  readonly inFlight = new Set<string>();
  private readonly transitionListeners: Array<(record: ItemRecord) => void> =
    [];
  private fatal?: unknown;
  private notify?: () => void;

  constructor(
    readonly deps: MigrationDeps<C>,
    readonly options: RunOptions,
    readonly directives: string[],
  ) {
    this.state = deps.state;
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
    this.scope = options.ids ? new Set(options.ids) : undefined;
    this.externalIds = new ExternalIds(
      deps.provider.id,
      deps.state.sourceIds(),
    );
    this.migrationId = deps.state.initMigration(deps.provider.id).id;
    if (options.timeBudgetMs !== undefined) {
      this.deadline = deps.clock.now() + options.timeBudgetMs;
    }
  }

  inScope(sourceId: string): boolean {
    return !this.scope || this.scope.has(sourceId);
  }

  deadlinePassed(): boolean {
    return (
      this.deadline !== undefined && this.deps.clock.now() >= this.deadline
    );
  }

  /** Stops the run with `error` at the next opportunity. */
  fail(error: unknown): void {
    this.fatal ??= error;
    this.notify?.();
  }

  throwIfFailed(): void {
    if (this.fatal !== undefined) throw this.fatal;
  }

  /** Wakes anything waiting in `nextChange`. */
  changed(): void {
    const notify = this.notify;
    this.notify = undefined;
    notify?.();
  }

  /** Resolves on the next state change or failure. */
  nextChange(): Promise<void> {
    return new Promise((resolve) => {
      this.notify = resolve;
    });
  }

  onTransition(listener: (record: ItemRecord) => void): void {
    this.transitionListeners.push(listener);
  }

  /** Writes the change, then reports it, so every event reflects saved state. */
  transition(sourceId: string, patch: ItemPatch): ItemRecord {
    const record = this.state.update(sourceId, patch);
    this.changed();
    for (const listener of this.transitionListeners) listener(record);
    this.deps.emit?.({
      type: 'item',
      source_id: sourceId,
      state: record.state,
      asset_id: record.assetId ?? null,
      ...(record.playbackIds[0] && { playback_id: record.playbackIds[0].id }),
      ...(record.error &&
        record.state === 'errored' && { error: record.error }),
    });
    return record;
  }

  warn(error: MigrationError): void {
    this.deps.emit?.({ type: 'warning', ...error });
  }
}
