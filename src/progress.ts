const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

export interface ContinuousProgressOptions {
  heartbeatMs?: number;
  maxActive?: number;
  maxLabelLength?: number;
  now?: () => number;
  redact?: (value: string) => string;
}

export type ProgressOperation = symbol;

function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function removeControlCharacters(value: string): string {
  return [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
}

export function progressLabel(value: string, maximumLength = 140): string {
  const normalized = removeControlCharacters(value.replace(ANSI_PATTERN, ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}

export class ContinuousProgress {
  private readonly startedAt: number;
  private lastCompletedAt: number;
  private current = 'Starting transfer';
  private readonly active = new Map<ProgressOperation, string>();
  private readonly heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private readonly now: () => number;
  private readonly maxActive: number;
  private readonly maxLabelLength: number;
  private readonly redact: (value: string) => string;

  constructor(
    private readonly emit: ((message: string) => void) | undefined,
    options: ContinuousProgressOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.maxActive = options.maxActive ?? 3;
    this.maxLabelLength = options.maxLabelLength ?? 140;
    this.redact = options.redact ?? ((value) => value);
    this.startedAt = this.now();
    this.lastCompletedAt = this.startedAt;
    if (emit) {
      this.heartbeat = setInterval(() => this.emitHeartbeat(), options.heartbeatMs ?? 5_000);
      this.heartbeat.unref?.();
    }
  }

  phase(message: string): void {
    if (this.stopped) return;
    this.current = this.clean(message);
    this.emitSnapshot(false);
  }

  complete(message: string): void {
    if (this.stopped) return;
    this.current = this.clean(message);
    this.lastCompletedAt = this.now();
    this.emitSnapshot(false);
  }

  begin(label: string): ProgressOperation {
    const operation = Symbol('progress-operation');
    if (this.stopped) return operation;
    this.active.set(operation, this.clean(label));
    this.emitSnapshot(false);
    return operation;
  }

  update(operation: ProgressOperation, label: string): void {
    if (this.stopped || !this.active.has(operation)) return;
    this.active.set(operation, this.clean(label));
    this.emitSnapshot(false);
  }

  end(operation: ProgressOperation): void {
    if (this.stopped) return;
    this.active.delete(operation);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.active.clear();
  }

  private clean(value: string): string {
    return progressLabel(this.redact(value), this.maxLabelLength);
  }

  private activeSummary(): string {
    if (this.active.size === 0) return '';
    const labels = [...this.active.values()].slice(0, this.maxActive);
    const remaining = this.active.size - labels.length;
    return ` · active ${this.active.size}: ${labels.join('; ')}${remaining > 0 ? ` (+${remaining})` : ''}`;
  }

  private emitHeartbeat(): void {
    if (this.stopped) return;
    this.emitSnapshot(true);
  }

  private emitSnapshot(heartbeat: boolean): void {
    if (!this.emit) return;
    const active = this.activeSummary();
    if (!heartbeat) {
      this.emit(`${this.current}${active}`);
      return;
    }
    const currentTime = this.now();
    this.emit(`Still working · ${this.current}${active} · elapsed ${duration(currentTime - this.startedAt)} · last completion ${duration(currentTime - this.lastCompletedAt)} ago`);
  }
}
