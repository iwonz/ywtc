export interface CooperativeSchedulerOptions {
  maxSliceMs?: number;
  now?: () => number;
  yieldControl?: () => Promise<void>;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted');
}

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class CooperativeScheduler {
  private lastYieldAt: number;
  private readonly maxSliceMs: number;
  private readonly now: () => number;
  private readonly yieldControl: () => Promise<void>;

  constructor(options: CooperativeSchedulerOptions = {}) {
    this.maxSliceMs = Math.max(0, options.maxSliceMs ?? 25);
    this.now = options.now ?? Date.now;
    this.yieldControl = options.yieldControl ?? defaultYieldControl;
    this.lastYieldAt = this.now();
  }

  async checkpoint(options: {force?: boolean; signal?: AbortSignal} = {}): Promise<boolean> {
    if (options.signal?.aborted) throw abortReason(options.signal);
    if (!options.force && this.now() - this.lastYieldAt < this.maxSliceMs) return false;
    await this.yieldControl();
    this.lastYieldAt = this.now();
    if (options.signal?.aborted) throw abortReason(options.signal);
    return true;
  }
}
