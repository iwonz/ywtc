import PQueue from 'p-queue';

export interface RateLimitOptions {
  requestsPerSecond: number;
  burst: number;
}

/** Shared request-start limiter backed by PQueue's strict rolling interval. */
export class RequestRateLimiter {
  private readonly queue: PQueue;
  private resumeTimer: NodeJS.Timeout | undefined;

  constructor(options: RateLimitOptions) {
    const burst = Math.max(1, options.burst);
    const interval = Math.max(1, Math.ceil((1_000 * burst) / Math.max(1, options.requestsPerSecond)));
    this.queue = new PQueue({
      concurrency: burst,
      interval,
      intervalCap: burst,
      carryoverIntervalCount: true,
      strict: true,
    });
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    await this.queue.add(async () => undefined, {...(signal ? {signal} : {})});
  }

  pause(delayMs: number): void {
    this.queue.pause();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = undefined;
      this.queue.start();
    }, Math.max(1_000, delayMs));
    this.resumeTimer.unref?.();
  }
}
