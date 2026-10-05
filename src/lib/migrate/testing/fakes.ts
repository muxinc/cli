import { Database } from 'bun:sqlite';
import type { Asset, AssetCreateParams } from '@mux/ts/resources/video/assets';
import type {
  Clock,
  DirectiveRunStatus,
  DirectiveRunSummary,
  DirectiveSummary,
  MigrationError,
  MigrationEventSource,
  MuxEvent,
  MuxMigrateClient,
  ResolveResult,
  SourceItem,
  SourceProvider,
  StreamMessage,
} from '../types.ts';

export class FakeClock implements Clock {
  constructor(public ms = Date.UTC(2026, 9, 5, 12, 0, 0)) {}
  now(): number {
    return this.ms;
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

/** Stands in for a process dying: nothing after it is persisted or sent. */
export class SimulatedCrash extends Error {
  constructor() {
    super('simulated crash');
  }
}

/**
 * An event stream the test controls. Events delivered while the stream is
 * closed or offline are dropped, as they would be on a real connection.
 */
export class FakeEventSource implements MigrationEventSource {
  opened = 0;
  private connected = false;
  private offline = false;
  private queue: StreamMessage[] = [];
  private wake: (() => void) | undefined;

  async open(signal: AbortSignal): Promise<AsyncIterable<StreamMessage>> {
    this.connected = true;
    this.opened++;
    signal.addEventListener('abort', () => {
      this.connected = false;
      this.wake?.();
    });
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!signal.aborted) {
          const next = self.queue.shift();
          if (next) {
            yield next;
            continue;
          }
          await new Promise<void>((resolve) => {
            self.wake = resolve;
          });
        }
      },
    };
  }

  deliver(event: MuxEvent): void {
    if (!this.connected || this.offline) return;
    this.push({ kind: 'event', event });
  }

  goOffline(): void {
    this.offline = true;
  }

  reconnect(): void {
    this.offline = false;
    this.push({ kind: 'reconnected' });
  }

  private push(message: StreamMessage): void {
    this.queue.push(message);
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }
}

// Shared across instances so a resumed run's fake never reuses an ID.
let nextId = 1;

interface CreateFailure {
  match: (params: AssetCreateParams) => boolean;
  error: Error;
  /** The request reached Mux and the asset exists, but the response was lost. */
  assetCreated: boolean;
}

/**
 * An in-memory Mux that emits the webhook events the real API would. Assets
 * become ready immediately unless `autoReady` is false.
 */
export class FakeMux implements MuxMigrateClient {
  assets: Asset[] = [];
  deleted: string[] = [];
  createCalls: AssetCreateParams[] = [];
  directives = new Map<string, DirectiveSummary>();
  runs: DirectiveRunSummary[] = [];
  autoReady = true;
  directiveOutcome: DirectiveRunStatus = 'completed';
  /** False to simulate attached directives that never start a run. */
  startDirectiveRuns = true;
  textTrackStatus: 'ready' | 'preparing' = 'ready';
  /** Milliseconds each create request takes on the fake clock. */
  createDurationMs = 0;
  /** After a simulated crash, every call fails and nothing is created. */
  dead = false;
  beforeCreate?: (params: AssetCreateParams) => void;
  afterCreate?: (asset: Asset, params: AssetCreateParams) => void;
  private failures: CreateFailure[] = [];
  private inputs = new Map<string, NonNullable<AssetCreateParams['inputs']>>();

  constructor(
    private clock: FakeClock,
    private stream: FakeEventSource,
  ) {}

  failCreate(failure: CreateFailure): void {
    this.failures.push(failure);
  }

  /** Adds an asset as if another process created it, and emits its event. */
  injectAsset(meta: { external_id?: string }, createdAtMs = this.clock.now()) {
    const asset = this.makeAsset({ inputs: [], meta }, createdAtMs);
    this.assets.unshift(asset);
    this.emit('video.asset.created', asset);
    return asset;
  }

  async createAsset(params: AssetCreateParams): Promise<Asset> {
    if (this.dead) throw new SimulatedCrash();
    this.createCalls.push(params);
    this.beforeCreate?.(params);
    if (this.dead) throw new SimulatedCrash();
    this.clock.advance(this.createDurationMs);

    const index = this.failures.findIndex((f) => f.match(params));
    const failure = index === -1 ? undefined : this.failures[index];
    if (failure) this.failures.splice(index, 1);
    if (failure && !failure.assetCreated) throw failure.error;

    const asset = this.makeAsset(params, this.clock.now());
    this.assets.unshift(asset);
    this.inputs.set(asset.id, params.inputs ?? []);
    this.emit('video.asset.created', asset);
    if (this.autoReady) this.markReady(asset.id);

    if (failure) throw failure.error;
    this.afterCreate?.(asset, params);
    if (this.dead) throw new SimulatedCrash();
    return structuredClone(asset);
  }

  markReady(assetId: string): void {
    const asset = this.find(assetId);
    asset.status = 'ready';
    asset.tracks = (this.inputs.get(assetId) ?? [])
      .filter((input) => input.type === 'text')
      .map((input, i) => ({
        id: `track_${assetId}_${i}`,
        type: 'text',
        status: this.textTrackStatus,
        language_code: input.language_code,
      }));
    this.emit('video.asset.ready', asset);
    for (const { id } of this.startDirectiveRuns
      ? (asset.directives ?? [])
      : []) {
      const run: DirectiveRunSummary = {
        runId: `drvrun_${nextId++}`,
        directiveId: id,
        assetId,
        status: 'pending',
      };
      this.runs.push(run);
      this.emitRun('robots.directive_run.created', run);
      run.status = this.directiveOutcome;
      this.emitRun(`robots.directive_run.${this.directiveOutcome}`, run);
    }
  }

  async retrieveAsset(assetId: string): Promise<Asset> {
    if (this.dead) throw new SimulatedCrash();
    return structuredClone(this.find(assetId));
  }

  async *listAssets(): AsyncIterable<Asset> {
    if (this.dead) throw new SimulatedCrash();
    for (const asset of [...this.assets]) yield structuredClone(asset);
  }

  async retrieveDirective(directiveId: string): Promise<DirectiveSummary> {
    if (this.dead) throw new SimulatedCrash();
    const directive = this.directives.get(directiveId);
    if (!directive) {
      throw Object.assign(new Error('Not found'), { status: 404 });
    }
    return directive;
  }

  async *listDirectiveRuns(
    directiveId: string,
  ): AsyncIterable<DirectiveRunSummary> {
    for (const run of this.runs) {
      if (run.directiveId === directiveId) yield { ...run };
    }
  }

  assetsWithExternalId(externalId: string): Asset[] {
    return this.assets.filter((a) => a.meta?.external_id === externalId);
  }

  private find(assetId: string): Asset {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) throw Object.assign(new Error('Not found'), { status: 404 });
    return asset;
  }

  private makeAsset(params: AssetCreateParams, createdAtMs: number): Asset {
    const id = `asset_${nextId++}`;
    return {
      id,
      status: 'preparing',
      created_at: String(Math.floor(createdAtMs / 1000)),
      meta: params.meta,
      passthrough: params.passthrough,
      directives: params.directives,
      playback_ids: [{ id: `pb_${id}`, policy: 'public' }],
    } as unknown as Asset;
  }

  private emit(type: string, asset: Asset): void {
    if (this.dead) return;
    this.stream.deliver({
      id: `evt_${nextId++}`,
      type,
      data: structuredClone(asset) as unknown as Record<string, unknown>,
    });
  }

  private emitRun(type: string, run: DirectiveRunSummary): void {
    if (this.dead) return;
    this.stream.deliver({
      id: `evt_${nextId++}`,
      type,
      data: {
        directive_run: {
          id: run.runId,
          directive_id: run.directiveId,
          asset_id: run.assetId,
          status: run.status,
          node_states: [],
        },
      },
    });
  }
}

export function sourceItem(
  sourceId: string,
  overrides: Partial<SourceItem> = {},
): SourceItem {
  return {
    sourceId,
    type: 'video',
    exportable: true,
    sourceUrl: `https://example.com/${sourceId}.mp4`,
    embedPatterns: [`example.com/${sourceId}`],
    captionCount: 0,
    raw: {},
    ...overrides,
  };
}

/** A provider backed by a fixed list, paged two items at a time. */
export class FakeProvider implements SourceProvider<void> {
  id = 'manifest' as const;
  credentials = { variables: [], read: () => undefined };
  defaultConcurrency = 1;
  resolveCalls: string[] = [];
  resolveOverride?: (item: SourceItem) => ResolveResult;
  listWarnings: MigrationError[] = [];

  constructor(public items: SourceItem[]) {}

  async verify() {
    return { ok: true, warnings: [] };
  }

  async list(_creds: unknown, cursor?: string) {
    const start = cursor ? Number(cursor) : 0;
    const end = start + 2;
    return {
      items: this.items.slice(start, end),
      next: end < this.items.length ? String(end) : undefined,
      warnings: start === 0 ? this.listWarnings : [],
    };
  }

  async resolve(_creds: unknown, item: SourceItem): Promise<ResolveResult> {
    this.resolveCalls.push(item.sourceId);
    if (this.resolveOverride) return this.resolveOverride(item);
    return {
      kind: 'resolved',
      url: item.sourceUrl ?? '',
      fidelity: 'original',
      captions: [],
    };
  }
}

/** Copies the state database as it is at this instant, for crash tests. */
export function snapshotState(statePath: string, toPath: string): void {
  const db = new Database(statePath);
  try {
    db.exec(`VACUUM INTO '${toPath.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
}
