import { APIConnectionError } from '@mux/ts';
import type { Asset, AssetCreateParams } from '@mux/ts/resources/video/assets';
import { type ExitCodeValue, resolveExitCode } from './exit-codes.ts';
import type { ItemPatch, ItemRecord, MigrationState } from './state.ts';
import type {
  Clock,
  DirectiveRunStatus,
  DirectiveRunSummary,
  DirectiveSummary,
  ItemState,
  MigrationError,
  MigrationEventSource,
  MuxEvent,
  MuxMigrateClient,
  RunEvent,
  SourceItem,
  SourceProvider,
  StreamMessage,
} from './types.ts';

export interface MigrationDeps<Credentials = void> {
  state: MigrationState;
  provider: SourceProvider<Credentials>;
  credentials: Credentials;
  mux: MuxMigrateClient;
  events: MigrationEventSource;
  clock: Clock;
  /** Called after each state change has been written to the state file. */
  emit?: (event: RunEvent) => void;
}

export interface PlanSummary {
  total: number;
  added: number;
  exportable: number;
  skipped: number;
  by_type: Partial<Record<SourceItem['type'], number>>;
  skip_reasons: Record<string, number>;
  /** Sum of known source durations; null when the provider reports none. */
  duration_seconds: number | null;
  size_bytes: number | null;
  fidelity: { original: number; rendition: number; unknown: number };
  /** Source caption tracks by language. */
  captions: Record<string, number>;
  directives: Array<DirectiveSummary & { items: number }>;
  warnings: MigrationError[];
  pricing_url: string;
}

export const PRICING_URL = 'https://www.mux.com/pricing';

export interface RunOptions {
  /** `--yes`. Without it nothing is created and the exit code is 3. */
  confirmed: boolean;
  limit?: number;
  ids?: string[];
  timeBudgetMs?: number;
  concurrency?: number;
  /** False with `--no-wait`. Defaults to true. */
  wait?: boolean;
  directives?: string[];
  skipRobots?: boolean;
  /** Playback and quality settings from the recipe and flags. */
  asset?: Omit<
    AssetCreateParams,
    'inputs' | 'meta' | 'passthrough' | 'directives'
  >;
  recipeHash?: string;
}

export interface DuplicateAsset {
  sourceId: string;
  keptAssetId: string;
  duplicateAssetId: string;
}

export interface RunResult {
  exitCode: ExitCodeValue;
  ready: number;
  errored: number;
  skipped: number;
  remaining: number;
  duplicates: DuplicateAsset[];
  nextCommand?: string;
  /** Set when the run stopped before creating anything. */
  error?: MigrationError;
  plan?: PlanSummary;
}

/**
 * How far before an item's create request an asset may have been created and
 * still belong to it. Covers clock skew between this machine and Mux.
 */
const ADOPTION_WINDOW_MS = 5 * 60_000;

/** A safety reconcile in case the stream silently stops delivering events. */
const RECONCILE_INTERVAL_MS = 60_000;

const PENDING_STATES: ItemState[] = [
  'discovered',
  'preparing',
  'resolved',
  'creating',
  'processing',
  'enriching',
];

const TERMINAL_RUN_STATUSES = new Set<DirectiveRunStatus>([
  'completed',
  'partial',
  'errored',
]);

/** Inventories the source into the state file. Free and idempotent. */
export async function planMigration<C>(
  deps: MigrationDeps<C>,
  options: { directives?: DirectiveSummary[] } = {},
): Promise<PlanSummary> {
  const { state, provider, credentials } = deps;
  state.initMigration(provider.id);
  let added = 0;
  const warnings: MigrationError[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.list(credentials, cursor);
    added += state.upsertDiscovered(page.items).added;
    warnings.push(...(page.warnings ?? []));
    cursor = page.next;
  } while (cursor);

  const records = state.list();
  const exportable = records.filter((record) => record.state !== 'skipped');
  const tally = (values: Array<string | undefined>) => {
    const counts: Record<string, number> = {};
    for (const value of values) {
      if (value !== undefined) counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  };
  const sum = (values: Array<number | undefined>) => {
    const known = values.filter((v): v is number => v !== undefined);
    return known.length ? known.reduce((total, v) => total + v, 0) : null;
  };
  const items = exportable.map((record) => record.item);

  return {
    total: records.length,
    added,
    exportable: exportable.length,
    skipped: records.length - exportable.length,
    by_type: tally(records.map((record) => record.item.type)),
    skip_reasons: tally(
      records
        .filter((record) => record.state === 'skipped')
        .map((record) => record.item.skipReason ?? 'Not exportable'),
    ),
    duration_seconds: sum(items.map((item) => item.durationSeconds)),
    size_bytes: sum(items.map((item) => item.sizeBytes)),
    fidelity: {
      original: items.filter((item) => item.expectedFidelity === 'original')
        .length,
      rendition: items.filter((item) => item.expectedFidelity === 'rendition')
        .length,
      unknown: items.filter((item) => item.expectedFidelity === undefined)
        .length,
    },
    captions: tally(items.flatMap((item) => item.captionLanguages ?? [])),
    directives: (options.directives ?? []).map((directive) => ({
      ...directive,
      items: exportable.length,
    })),
    warnings,
    pricing_url: PRICING_URL,
  };
}

/** Re-queues errored items. Returns the number re-queued. */
export function retryErrored(state: MigrationState, ids?: string[]): number {
  const errored = state
    .list({ states: ['errored'] })
    .filter((record) => !ids || ids.includes(record.sourceId));
  for (const record of errored) {
    state.update(record.sourceId, { state: 'discovered', error: undefined });
  }
  return errored.length;
}

export async function runMigration<C>(
  deps: MigrationDeps<C>,
  options: RunOptions,
): Promise<RunResult> {
  const verified = await deps.provider.verify(deps.credentials);
  if (!verified.ok) {
    return stoppedResult(
      deps,
      options,
      { usageError: true },
      verified.warnings[0],
    );
  }

  const directives = options.skipRobots ? [] : (options.directives ?? []);
  const loaded = await loadDirectives(deps.mux, directives);
  if ('error' in loaded) {
    return stoppedResult(deps, options, { usageError: true }, loaded.error);
  }
  const plan = await planMigration(deps, { directives: loaded.directives });
  if (!options.confirmed) {
    return stoppedResult(
      deps,
      options,
      { confirmationRequired: true },
      undefined,
      plan,
    );
  }

  const run = new MigrationRun(deps, options, directives);
  return run.execute(plan);
}

/** Retrieves each directive, or the first error that makes the run invalid. */
export async function loadDirectives(
  mux: MuxMigrateClient,
  ids: string[],
): Promise<{ directives: DirectiveSummary[] } | { error: MigrationError }> {
  const directives: DirectiveSummary[] = [];
  for (const id of ids) {
    try {
      directives.push(await mux.retrieveDirective(id));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404) {
        return {
          error: {
            code: 'DIRECTIVE_NOT_FOUND',
            message: `Directive ${id} was not found in this environment.`,
            hint: 'Check the directive ID in the Directives section of the Mux Dashboard.',
          },
        };
      }
      if (status === 401 || status === 403) {
        return {
          error: {
            code: 'ROBOTS_NOT_ENABLED',
            message: `Directive ${id} could not be read with the current credentials.`,
            hint: 'Make sure Mux Robots is enabled for this environment and the token has Robots permissions.',
          },
        };
      }
      throw error;
    }
  }
  return { directives };
}

function stoppedResult<C>(
  deps: MigrationDeps<C>,
  options: RunOptions,
  outcome: { usageError?: boolean; confirmationRequired?: boolean },
  error?: MigrationError,
  plan?: PlanSummary,
): RunResult {
  const tally = tallyScope(deps.state, options.ids);
  const exitCode = resolveExitCode({ ...outcome, ...tally });
  const nextCommand = outcome.confirmationRequired
    ? continueCommand(options)
    : error?.next_command;
  return {
    exitCode,
    ...tally,
    duplicates: [],
    nextCommand,
    error,
    plan,
  };
}

function tallyScope(state: MigrationState, ids?: string[]) {
  const scope = state
    .list()
    .filter((record) => !ids || ids.includes(record.sourceId));
  const count = (states: ItemState[]) =>
    scope.filter((record) => states.includes(record.state)).length;
  return {
    ready: count(['ready']),
    errored: count(['errored']),
    skipped: count(['skipped']),
    remaining: count(PENDING_STATES),
  };
}

function formatDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

/**
 * The command that continues this migration. It repeats the run's own
 * batching flags and never includes --no-wait, so running it always makes
 * progress.
 */
export function continueCommand(options: RunOptions): string {
  const parts = ['mux migrate run --yes'];
  if (options.ids?.length) parts.push(`--ids ${options.ids.join(',')}`);
  if (options.limit !== undefined) parts.push(`--limit ${options.limit}`);
  if (options.timeBudgetMs !== undefined) {
    parts.push(`--time-budget ${formatDuration(options.timeBudgetMs)}`);
  }
  return parts.join(' ');
}

function isDefinitiveRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function assetCreatedAtMs(asset: { created_at?: unknown }): number {
  return Number(asset.created_at) * 1000;
}

function assetErrorMessage(asset: Record<string, unknown>): string {
  const messages = (asset.errors as { messages?: string[] } | undefined)
    ?.messages;
  return messages?.length
    ? messages.join(' ')
    : 'Mux could not process the asset.';
}

class MigrationRun<C> {
  private readonly state: MigrationState;
  private readonly prefix: string;
  private readonly deadline?: number;
  private readonly controller = new AbortController();
  private readonly inFlight = new Set<string>();
  private readonly duplicates: DuplicateAsset[] = [];
  private readonly reportedDuplicates = new Set<string>();
  private fatal?: unknown;
  private notify?: () => void;

  constructor(
    private readonly deps: MigrationDeps<C>,
    private readonly options: RunOptions,
    private readonly directives: string[],
  ) {
    this.state = deps.state;
    this.prefix = `${deps.provider.id}:`;
    if (options.timeBudgetMs !== undefined) {
      this.deadline = deps.clock.now() + options.timeBudgetMs;
    }
  }

  async execute(plan: PlanSummary): Promise<RunResult> {
    const stream = await this.deps.events.open(this.controller.signal);
    const consuming = this.consume(stream);
    const reconcileTimer = setInterval(() => {
      this.reconcile().catch((error) => this.fail(error));
    }, RECONCILE_INTERVAL_MS);

    try {
      await this.reconcile({ resume: true });
      await this.createAll();
      if (this.options.wait !== false) await this.waitForProcessing();
      // Handle events that have already arrived, such as the created event
      // of a duplicate, before the stream is closed.
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.throwIfFailed();
    } finally {
      clearInterval(reconcileTimer);
      this.controller.abort();
      this.notify?.();
      await consuming;
    }
    this.throwIfFailed();
    return this.finish(plan);
  }

  private finish(plan: PlanSummary): RunResult {
    for (const record of this.state.list({ states: ['creating'] })) {
      if (!this.inScope(record.sourceId)) continue;
      this.warn({
        code: 'CREATE_OUTCOME_UNKNOWN',
        message: `The create request for ${record.sourceId} got no response. The next run checks whether the asset exists before creating it again.`,
        next_command: continueCommand(this.options),
      });
    }

    const tally = tallyScope(this.state, this.options.ids);
    const exitCode = resolveExitCode(tally);
    let nextCommand: string | undefined;
    if (tally.remaining > 0) nextCommand = continueCommand(this.options);
    else if (tally.errored > 0) nextCommand = 'mux migrate retry';

    this.deps.emit?.({
      type: 'summary',
      ...tally,
      duplicates: this.duplicates.length,
      ...(nextCommand && { next_command: nextCommand }),
    });
    return {
      exitCode,
      ...tally,
      duplicates: this.duplicates,
      nextCommand,
      plan,
    };
  }

  private inScope(sourceId: string): boolean {
    return !this.options.ids || this.options.ids.includes(sourceId);
  }

  private deadlinePassed(): boolean {
    return (
      this.deadline !== undefined && this.deps.clock.now() >= this.deadline
    );
  }

  private fail(error: unknown): void {
    this.fatal ??= error;
    this.notify?.();
  }

  private throwIfFailed(): void {
    if (this.fatal !== undefined) throw this.fatal;
  }

  private changed(): void {
    const notify = this.notify;
    this.notify = undefined;
    notify?.();
  }

  private transition(sourceId: string, patch: ItemPatch): ItemRecord {
    const record = this.state.update(sourceId, patch);
    this.changed();
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

  private warn(error: MigrationError): void {
    this.deps.emit?.({ type: 'warning', ...error });
  }

  private async createAll(): Promise<void> {
    let queue = this.state
      .list({ states: ['discovered', 'preparing', 'resolved'] })
      .filter((record) => this.inScope(record.sourceId));
    if (this.options.limit !== undefined) {
      queue = queue.slice(0, this.options.limit);
    }

    const concurrency = Math.max(
      1,
      this.options.concurrency ?? this.deps.provider.defaultConcurrency,
    );
    const worker = async () => {
      for (let record = queue.shift(); record; record = queue.shift()) {
        this.throwIfFailed();
        if (this.deadlinePassed()) return;
        await this.migrateItem(record);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  private async migrateItem(record: ItemRecord): Promise<void> {
    const { sourceId } = record;
    const resolved = await this.deps.provider.resolve(
      this.deps.credentials,
      record.item,
    );
    if (resolved.kind === 'pending') {
      this.transition(sourceId, { state: 'preparing' });
      return;
    }
    if (resolved.kind === 'unavailable') {
      this.transition(sourceId, {
        state: 'errored',
        error: { code: resolved.code, message: resolved.message },
      });
      return;
    }
    this.transition(sourceId, {
      state: 'resolved',
      fidelity: resolved.fidelity,
    });

    const { item } = record;
    const params: AssetCreateParams = {
      ...this.options.asset,
      inputs: [
        { url: resolved.url },
        ...resolved.captions.flatMap((caption) =>
          caption.kind === 'url'
            ? [
                {
                  url: caption.url,
                  type: 'text' as const,
                  text_type: 'subtitles' as const,
                  language_code: caption.language,
                  name: caption.label,
                  closed_captions: caption.closedCaptions,
                },
              ]
            : [],
        ),
      ],
      meta: {
        external_id: `${this.prefix}${sourceId}`,
        ...(item.title && { title: item.title.slice(0, 512) }),
      },
      ...(item.passthrough && { passthrough: item.passthrough }),
      ...(this.directives.length > 0 && {
        directives: this.directives.map((id) => ({ id })),
      }),
    };

    this.transition(sourceId, {
      state: 'creating',
      createStartedAt: this.deps.clock.now(),
      attempts: record.attempts + 1,
      recipeHash: this.options.recipeHash,
    });

    this.inFlight.add(sourceId);
    let asset: Asset;
    try {
      asset = await this.deps.mux.createAsset(params);
    } catch (error) {
      this.handleCreateFailure(sourceId, error);
      return;
    } finally {
      this.inFlight.delete(sourceId);
      this.changed();
    }
    this.recordAsset(sourceId, asset);
  }

  private handleCreateFailure(sourceId: string, error: unknown): void {
    // A dropped connection or a 5xx response does not say whether Mux created
    // the asset. The item stays in `creating` until its created event arrives
    // or the next run finds the asset by external ID.
    if (error instanceof APIConnectionError) return;
    const status = (error as { status?: unknown }).status;
    if (typeof status !== 'number') throw error;
    if (status === 429) {
      this.transition(sourceId, { state: 'discovered' });
      return;
    }
    if (isDefinitiveRejection(status)) {
      this.transition(sourceId, {
        state: 'errored',
        error: {
          code: 'MUX_ASSET_CREATE_REJECTED',
          message: (error as Error).message,
          next_command: 'mux migrate retry',
        },
      });
    }
  }

  /** Records an asset for an item, from a create response or a created event. */
  private recordAsset(sourceId: string, asset: Asset): void {
    const record = this.state.get(sourceId);
    if (!record) return;
    if (record.assetId && record.assetId !== asset.id) {
      this.reportDuplicate(record, asset.id);
      return;
    }
    if (record.assetId === asset.id && record.state !== 'creating') return;

    const playbackIds = (asset.playback_ids ?? []).map((p) => ({
      id: p.id as string,
      policy: p.policy as string,
    }));
    this.transition(sourceId, {
      state: 'processing',
      assetId: asset.id,
      playbackIds,
    });
    if (asset.status === 'ready') this.markReady(sourceId, asset);
    if (asset.status === 'errored') this.markErrored(sourceId, asset);
  }

  private reportDuplicate(record: ItemRecord, duplicateAssetId: string): void {
    if (this.reportedDuplicates.has(duplicateAssetId)) return;
    this.reportedDuplicates.add(duplicateAssetId);
    const duplicate = {
      sourceId: record.sourceId,
      keptAssetId: record.assetId as string,
      duplicateAssetId,
    };
    this.duplicates.push(duplicate);
    this.warn({
      code: 'DUPLICATE_ASSET',
      message: `Source ${record.sourceId} has a second asset, ${duplicateAssetId}. The migration kept ${duplicate.keptAssetId} and did not delete the duplicate.`,
      hint: 'Delete the duplicate once you have confirmed it is not in use.',
      next_command: `mux assets delete ${duplicateAssetId}`,
    });
  }

  private markReady(sourceId: string, asset: Asset): void {
    const record = this.state.get(sourceId);
    if (!record || record.assetId !== asset.id) return;
    if (record.state !== 'processing') return;

    const attached = (asset.directives ?? []).map((d) => d.id);
    if (attached.length === 0) {
      this.transition(sourceId, { state: 'ready' });
      return;
    }
    const runs: DirectiveRunSummary[] = attached.map(
      (directiveId) =>
        record.directiveRuns.find((run) => run.directiveId === directiveId) ?? {
          runId: '',
          directiveId,
          assetId: asset.id,
          status: 'pending',
        },
    );
    this.transition(sourceId, { state: 'enriching', directiveRuns: runs });
    this.completeIfEnriched(sourceId);
  }

  private markErrored(sourceId: string, asset: Asset): void {
    const record = this.state.get(sourceId);
    if (!record || record.assetId !== asset.id) return;
    this.transition(sourceId, {
      state: 'errored',
      error: {
        code: 'MUX_ASSET_ERRORED',
        message: assetErrorMessage(asset as unknown as Record<string, unknown>),
        next_command: 'mux migrate retry',
      },
    });
  }

  private recordDirectiveRun(run: DirectiveRunSummary): void {
    const record = this.state.findByAssetId(run.assetId);
    if (!record) return;
    const runs = record.directiveRuns.filter(
      (existing) => existing.directiveId !== run.directiveId,
    );
    runs.push(run);
    this.state.update(record.sourceId, { directiveRuns: runs });
    this.completeIfEnriched(record.sourceId);
  }

  private completeIfEnriched(sourceId: string): void {
    const record = this.state.get(sourceId);
    if (!record || record.state !== 'enriching') return;
    if (
      !record.directiveRuns.every((run) =>
        TERMINAL_RUN_STATUSES.has(run.status),
      )
    ) {
      return;
    }
    for (const run of record.directiveRuns) {
      if (run.status === 'completed') continue;
      this.warn({
        code:
          run.status === 'partial'
            ? 'DIRECTIVE_RUN_PARTIAL'
            : 'DIRECTIVE_RUN_ERRORED',
        message: `Directive ${run.directiveId} run ${run.runId} on asset ${run.assetId} ended ${run.status}. The asset migrated; some enrichment did not complete.`,
        hint: 'Open the run in the Directives section of the Mux Dashboard to see which workflows failed.',
      });
    }
    this.transition(sourceId, { state: 'ready' });
  }

  private sourceIdFor(asset: Record<string, unknown>): string | undefined {
    const externalId = (asset.meta as { external_id?: unknown } | undefined)
      ?.external_id;
    if (typeof externalId !== 'string' || !externalId.startsWith(this.prefix)) {
      return undefined;
    }
    return externalId.slice(this.prefix.length);
  }

  /** Whether an asset was created late enough to belong to this item's create request. */
  private withinAdoptionWindow(
    record: ItemRecord,
    asset: { created_at?: unknown },
  ) {
    return (
      record.createStartedAt !== undefined &&
      assetCreatedAtMs(asset) >= record.createStartedAt - ADOPTION_WINDOW_MS
    );
  }

  private async consume(stream: AsyncIterable<StreamMessage>): Promise<void> {
    try {
      for await (const message of stream) {
        if (this.controller.signal.aborted) break;
        if (message.kind === 'reconnected') {
          await this.reconcile();
        } else {
          this.handleEvent(message.event);
        }
      }
    } catch (error) {
      if (!this.controller.signal.aborted) this.fail(error);
    }
  }

  private handleEvent(event: MuxEvent): void {
    if (event.type.startsWith('robots.directive_run.')) {
      const payload = (event.data.directive_run ??
        (event.data[event.type] as { directive_run?: unknown } | undefined)
          ?.directive_run) as Record<string, unknown> | undefined;
      if (!payload) return;
      this.recordDirectiveRun({
        runId: String(payload.id ?? payload.run_id ?? ''),
        directiveId: String(payload.directive_id ?? ''),
        assetId: String(payload.asset_id ?? payload.subject_id ?? ''),
        status: payload.status as DirectiveRunStatus,
      });
      return;
    }

    if (!event.type.startsWith('video.asset.')) return;
    const sourceId = this.sourceIdFor(event.data);
    if (!sourceId) return;
    const record = this.state.get(sourceId);
    if (!record) return;
    const asset = event.data as unknown as Asset;

    switch (event.type) {
      case 'video.asset.created':
        if (this.withinAdoptionWindow(record, asset)) {
          this.recordAsset(sourceId, asset);
        }
        return;
      case 'video.asset.ready':
        if (!record.assetId && this.withinAdoptionWindow(record, asset)) {
          this.recordAsset(sourceId, asset);
        }
        this.markReady(sourceId, asset);
        return;
      case 'video.asset.errored':
        this.markErrored(sourceId, asset);
        return;
    }
  }

  /**
   * Brings in-flight items up to date after a gap in the event stream: at the
   * start of a run, after a reconnect, and periodically as a safety net.
   */
  private async reconcile({ resume = false } = {}): Promise<void> {
    await this.adoptOrphanedCreates(resume);

    for (const record of this.state.list({ states: ['processing'] })) {
      if (!record.assetId) continue;
      const asset = await this.deps.mux.retrieveAsset(record.assetId);
      if (asset.status === 'ready') this.markReady(record.sourceId, asset);
      else if (asset.status === 'errored')
        this.markErrored(record.sourceId, asset);
    }

    for (const record of this.state.list({ states: ['enriching'] })) {
      for (const run of record.directiveRuns) {
        if (TERMINAL_RUN_STATUSES.has(run.status)) continue;
        for await (const found of this.deps.mux.listDirectiveRuns(
          run.directiveId,
        )) {
          if (found.assetId === record.assetId) {
            this.recordDirectiveRun(found);
            break;
          }
        }
      }
    }
  }

  /**
   * Items in `creating` with no request in flight lost their create response.
   * The asset list has no filters, so scan it newest first back to the oldest
   * create attempt and match by external ID. On resume, an item with no match
   * was never created and is queued again.
   */
  private async adoptOrphanedCreates(resume: boolean): Promise<void> {
    const orphans = this.state
      .list({ states: ['creating'] })
      .filter((record) => !this.inFlight.has(record.sourceId));
    if (orphans.length === 0) return;

    const pending = new Map(orphans.map((record) => [record.sourceId, record]));
    const oldest = Math.min(
      ...orphans.map((record) => record.createStartedAt ?? 0),
    );
    for await (const asset of this.deps.mux.listAssets()) {
      if (assetCreatedAtMs(asset) < oldest - ADOPTION_WINDOW_MS) break;
      const sourceId = this.sourceIdFor(
        asset as unknown as Record<string, unknown>,
      );
      const record = sourceId ? pending.get(sourceId) : undefined;
      if (!record || !this.withinAdoptionWindow(record, asset)) continue;
      pending.delete(record.sourceId);
      this.recordAsset(record.sourceId, asset);
      if (pending.size === 0) break;
    }

    if (!resume) return;
    for (const record of pending.values()) {
      this.transition(record.sourceId, { state: 'discovered' });
    }
  }

  private async waitForProcessing(): Promise<void> {
    while (true) {
      this.throwIfFailed();
      if (this.deadlinePassed()) return;
      const busy =
        this.inFlight.size > 0 ||
        this.state.list({ states: ['processing', 'enriching'] }).length > 0;
      if (!busy) return;

      const changed = new Promise<void>((resolve) => {
        this.notify = resolve;
      });
      const waits: Promise<void>[] = [changed];
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (this.deadline !== undefined) {
        const remaining = Math.max(0, this.deadline - this.deps.clock.now());
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
}
