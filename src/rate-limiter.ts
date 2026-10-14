export interface TokenBucketOptions {
  requestsPerSecond: number;
  burst: number;
}

interface Waiter {
  resolve: () => void;
}

/**
 * A service-wide token bucket. It limits request starts; operation concurrency is
 * controlled separately so long-running uploads keep occupying their own slots.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  private pausedUntil = 0;
  private readonly queue: Waiter[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.burst;
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({resolve});
      this.pump();
    });
  }

  pause(delayMs: number): void {
    const safeDelay = Math.max(1_000, delayMs);
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + safeDelay);
    this.tokens = Math.min(this.tokens, 1);
    this.pump();
  }

  private refill(now: number): void {
    if (now <= this.lastRefill) return;
    const elapsedSeconds = (now - this.lastRefill) / 1_000;
    this.tokens = Math.min(
      this.options.burst,
      this.tokens + elapsedSeconds * this.options.requestsPerSecond,
    );
    this.lastRefill = now;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, Math.max(1, Math.ceil(delayMs)));
  }

  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.queue.length === 0) return;

    const now = Date.now();
    this.refill(now);
    if (now < this.pausedUntil) {
      this.schedule(this.pausedUntil - now);
      return;
    }

    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.queue.shift()?.resolve();
    }

    if (this.queue.length > 0) {
      const missing = Math.max(0, 1 - this.tokens);
      this.schedule((missing / this.options.requestsPerSecond) * 1_000);
    }
  }
}
