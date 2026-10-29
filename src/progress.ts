const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

import type {OperationEvent, ProgressCounter} from './operation-events.js';

export interface ContinuousProgressOptions {
  onEvent?: (event: OperationEvent) => void;
  heartbeatMs?: number;
  maxActive?: number;
  maxLabelLength?: number;
  now?: () => number;
  redact?: (value: string) => string;
}

export interface ProgressMeasure {
  counters?: Record<string, ProgressCounter>;
  phase: string;
  completed: number;
  total?: number;
  unit: string;
  detail?: string;
  queued?: number;
  inFlight?: number;
}

interface ActiveMeasure extends ProgressMeasure {
  startedAt: number;
  startedCompleted: number;
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
  private readonly activeMetadata = new Map<ProgressOperation, {id: number; startedAt: number}>();
  private nextOperation = 0;
  private readonly heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private readonly now: () => number;
  private readonly maxActive: number;
  private readonly maxLabelLength: number;
  private readonly redact: (value: string) => string;
  private measureState: ActiveMeasure | undefined;

  constructor(
    private readonly emit: ((message: string) => void) | undefined,
    private readonly options: ContinuousProgressOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.maxActive = options.maxActive ?? 3;
    this.maxLabelLength = options.maxLabelLength ?? 140;
    this.redact = options.redact ?? ((value) => value);
    this.startedAt = this.now();
    this.lastCompletedAt = this.startedAt;
    if (emit || options.onEvent) {
      this.heartbeat = setInterval(() => this.emitHeartbeat(), options.heartbeatMs ?? 5_000);
      this.heartbeat.unref?.();
    }
  }

  phase(message: string): void {
    if (this.stopped) return;
    this.measureState = undefined;
    this.current = this.clean(message);
    this.emitSnapshot(false);
  }

  complete(message: string): void {
    if (this.stopped) return;
    this.measureState = undefined;
    this.current = this.clean(message);
    this.lastCompletedAt = this.now();
    this.emitSnapshot(false);
  }

  measure(input: ProgressMeasure): void {
    if (this.stopped) return;
    const currentTime = this.now();
    const phase = this.clean(input.phase);
    const unit = this.clean(input.unit);
    const completed = Math.max(0, Math.floor(input.completed));
    const total = input.total === undefined ? undefined : Math.max(completed, Math.floor(input.total));
    const previous = this.measureState;
    const reset = !previous || previous.phase !== phase || previous.unit !== unit || previous.total !== total;
    const advanced = !reset && completed > previous.completed;
    this.measureState = {
      phase,
      completed,
      ...(total !== undefined ? {total} : {}),
      unit,
      ...(input.counters ? {counters: input.counters} : {}),
      ...(input.detail ? {detail: this.clean(input.detail)} : {}),
      ...(input.queued !== undefined ? {queued: Math.max(0, Math.floor(input.queued))} : {}),
      ...(input.inFlight !== undefined ? {inFlight: Math.max(0, Math.floor(input.inFlight))} : {}),
      startedAt: reset ? currentTime : previous.startedAt,
      startedCompleted: reset ? completed : previous.startedCompleted,
    };
    if (advanced) this.lastCompletedAt = currentTime;
    this.current = this.measureSummary(currentTime);
    this.emitSnapshot(false);
  }

  begin(label: string): ProgressOperation {
    const operation = Symbol('progress-operation');
    if (this.stopped) return operation;
    this.active.set(operation, this.clean(label));
    this.activeMetadata.set(operation, {id: ++this.nextOperation, startedAt: this.now()});
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
    this.activeMetadata.delete(operation);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.active.clear();
    this.activeMetadata.clear();
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

  private measureSummary(currentTime: number): string {
    const measure = this.measureState;
    if (!measure) return this.current;
    const counter = measure.total === undefined
      ? `${measure.completed} ${measure.unit}`
      : `${measure.completed}/${measure.total} ${measure.unit}`;
    const details: string[] = [];
    if (measure.detail) details.push(measure.detail);
    if (measure.inFlight !== undefined) details.push(`in flight ${measure.inFlight}`);
    if (measure.queued !== undefined) details.push(`queued ${measure.queued}`);
    const elapsedMilliseconds = currentTime - measure.startedAt;
    const completedDelta = measure.completed - measure.startedCompleted;
    if (completedDelta >= 2 && elapsedMilliseconds >= 2_000) {
      const rate = completedDelta / (elapsedMilliseconds / 1_000);
      details.push(`${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} ${measure.unit}/s`);
      if (measure.total !== undefined && rate > 0 && measure.completed < measure.total) {
        details.push(`ETA ${duration(((measure.total - measure.completed) / rate) * 1_000)}`);
      }
    }
    return `${measure.phase} · ${counter}${details.length > 0 ? ` · ${details.join(' · ')}` : ''}`;
  }

  private emitHeartbeat(): void {
    if (this.stopped) return;
    this.emitSnapshot(true);
  }

  private emitSnapshot(heartbeat: boolean): void {
    const at = this.now(), measure = this.measureState;
    const delta = measure ? measure.completed - measure.startedCompleted : 0;
    const elapsed = measure ? at - measure.startedAt : 0;
    const rate = delta >= 2 && elapsed >= 2_000 ? delta * 1_000 / elapsed : undefined;
    this.options.onEvent?.({
      type: 'progress', reason: heartbeat ? 'heartbeat' : 'update', phase: measure?.phase ?? this.current,
      ...(measure ? {completed: measure.completed, unit: measure.unit,
        ...(measure.total !== undefined ? {total: measure.total} : {}),
        ...(measure.counters ? {counters: measure.counters} : {}),
        ...(measure.detail ? {detail: measure.detail} : {}),
        ...(measure.queued !== undefined ? {queued: measure.queued} : {}),
        ...(measure.inFlight !== undefined ? {inFlight: measure.inFlight} : {}),
      } : {}),
      ...(rate !== undefined ? {rate, ...(measure?.total !== undefined ? {etaMs: Math.max(0, (measure.total - measure.completed) * 1_000 / rate)} : {})} : {}),
      elapsedMs: at - this.startedAt, lastCompletedAt: this.lastCompletedAt,
      active: [...this.active].slice(0, this.maxActive).map(([key, label]) => ({...this.activeMetadata.get(key)!, label})),
    });
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
