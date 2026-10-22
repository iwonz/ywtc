import {afterEach, describe, expect, it, vi} from 'vitest';
import {ContinuousProgress, progressLabel} from '../src/progress.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('continuous transfer progress', () => {
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

  it('normalizes standalone progress labels', () => {
    expect(progressLabel('  Page\n\tname  ')).toBe('Page name');
    expect(progressLabel('123456789', 6)).toBe('12345…');
  });
});
