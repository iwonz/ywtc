import {afterEach, describe, expect, it, vi} from 'vitest';
import {ContinuousProgress, progressLabel} from '../src/progress.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('continuous transfer progress', () => {
  it('emits typed replayable snapshots without a terminal callback', () => {
    vi.useFakeTimers();
    const events: import('../src/operation-events.js').OperationEvent[] = [];
    const progress = new ContinuousProgress(undefined, {heartbeatMs: 100, onEvent: event => events.push(event), redact: value => value.replaceAll('private-token', '[REDACTED]')});
    progress.measure({phase: 'Transfer', completed: 2, total: 10, unit: 'pages', counters: {pages: {completed: 2, total: 10}, files: {completed: 1}}});
    const active = progress.begin('upload private-token');
    vi.advanceTimersByTime(100);
    expect(events.at(-1)).toMatchObject({type: 'progress', reason: 'heartbeat', phase: 'Transfer', completed: 2, total: 10, counters: {files: {completed: 1}}});
    expect(JSON.stringify(events)).not.toContain('private-token');
    expect(events.at(-1)).toMatchObject({active: [{label: 'upload [REDACTED]'}]});
    progress.end(active);progress.stop();
    const length = events.length;vi.advanceTimersByTime(200);expect(events).toHaveLength(length);
  });
  it('keeps in-flight work distinct from confirmed completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const messages: string[] = [];
    const progress = new ContinuousProgress((message) => messages.push(message), {heartbeatMs: 5_000});

    progress.phase('Transferring pages · pages 1/10 · files 0/4');
    const first = progress.begin('upload image.png → Page A');
    const second = progress.begin('verify Page B');
    vi.advanceTimersByTime(5_000);

    expect(messages.at(-1)).toContain('Still working · Transferring pages · pages 1/10 · files 0/4');
    expect(messages.at(-1)).toContain('active 2: upload image.png → Page A; verify Page B');
    expect(messages.at(-1)).toContain('last completion 5s ago');

    progress.end(first);
    progress.complete('Transferring pages · pages 2/10 · files 1/4 · uploaded image.png');
    vi.advanceTimersByTime(5_000);
    expect(messages.at(-1)).toContain('pages 2/10 · files 1/4');
    expect(messages.at(-1)).toContain('active 1: verify Page B');
    expect(messages.at(-1)).toContain('last completion 5s ago');

    progress.end(second);
    progress.stop();
    const count = messages.length;
    vi.advanceTimersByTime(10_000);
    expect(messages).toHaveLength(count);
  });

  it('bounds and sanitizes active labels and redacts configured secrets', () => {
    const messages: string[] = [];
    const progress = new ContinuousProgress((message) => messages.push(message), {
      heartbeatMs: 60_000,
      maxActive: 1,
      maxLabelLength: 36,
      redact: (value) => value.replaceAll('secret-token', '[REDACTED]'),
    });
    progress.phase('Inventory\nphase');
    progress.begin('\u001B[31mfirst secret-token resource with a very long name\u001B[0m');
    progress.begin('second resource');

    expect(messages.at(-1)).not.toContain('\u001B');
    expect(messages.at(-1)).not.toContain('secret-token');
    expect(messages.at(-1)).toContain('[REDACTED]');
    expect(messages.at(-1)).toContain('(+1)');
    expect(messages.at(-1)?.split('\n')).toHaveLength(1);
    progress.stop();
  });

  it('shows truthful structured counters and evidence-gated estimates', () => {
    let now = 0;
    const messages: string[] = [];
    const progress = new ContinuousProgress((message) => messages.push(message), {
      heartbeatMs: 60_000,
      now: () => now,
    });

    progress.measure({phase: 'Bootstrap rendering', completed: 0, total: 10, unit: 'pages', inFlight: 1, queued: 9});
    expect(messages.at(-1)).toBe('Bootstrap rendering · 0/10 pages · in flight 1 · queued 9');
    expect(messages.at(-1)).not.toContain('ETA');

    now = 1_000;
    progress.measure({phase: 'Bootstrap rendering', completed: 1, total: 10, unit: 'pages', inFlight: 1, queued: 8});
    expect(messages.at(-1)).not.toContain('ETA');

    now = 4_000;
    progress.measure({phase: 'Bootstrap rendering', completed: 4, total: 10, unit: 'pages', detail: 'files 3/8', inFlight: 2, queued: 4});
    expect(messages.at(-1)).toContain('4/10 pages');
    expect(messages.at(-1)).toContain('files 3/8 · in flight 2 · queued 4');
    expect(messages.at(-1)).toContain('1.0 pages/s · ETA 6s');
    progress.stop();
  });

  it('redacts and bounds structured phase labels', () => {
    const messages: string[] = [];
    const progress = new ContinuousProgress((message) => messages.push(message), {
      heartbeatMs: 60_000,
      maxLabelLength: 24,
      redact: (value) => value.replaceAll('secret-token', '[REDACTED]'),
    });
    progress.measure({
      phase: 'Rendering secret-token pages with a very long phase name',
      completed: 2,
      total: 10,
      unit: 'pages',
    });

    expect(messages.at(-1)).not.toContain('secret-token');
    expect(messages.at(-1)).toContain('[REDACTED]');
    expect(messages.at(-1)?.split('\n')).toHaveLength(1);
    progress.stop();
  });

  it('normalizes standalone progress labels', () => {
    expect(progressLabel('  Page\n\tname  ')).toBe('Page name');
    expect(progressLabel('123456789', 6)).toBe('12345…');
  });
});
