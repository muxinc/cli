export interface RequestBucketOptions {
  capacity: number;
  perSecond: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A token bucket, the model Mux uses for its API rate limits: a burst up to
 * `capacity`, then `perSecond` sustained. Callers are served in order.
 */
export class RequestBucket {
  private tokens: number;
  private updatedAt: number;
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RequestBucketOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => Bun.sleep(ms));
    this.tokens = options.capacity;
    this.updatedAt = this.now();
  }

  /** Waits until a request may be sent. */
  take(): Promise<void> {
    const turn = this.queue.then(() => this.acquire());
    this.queue = turn.catch(() => {});
    return turn;
  }

  private async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      await this.sleep(((1 - this.tokens) / this.options.perSecond) * 1000);
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = this.now();
    const earned = ((now - this.updatedAt) / 1000) * this.options.perSecond;
    this.tokens = Math.min(this.options.capacity, this.tokens + earned);
    this.updatedAt = now;
  }
}
