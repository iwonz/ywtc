import {afterEach, describe, expect, it, vi} from 'vitest';
import {TerminalMigrationProgress} from '../src/progress.js';
import {TokenBucketRateLimiter} from '../src/rate-limiter.js';
import type {MigrationPlanSummary} from '../src/types.js';

afterEach(() => vi.useRealTimers());

describe('network rate limiting', () => {
  it('allows the configured burst and then refills at the configured rate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new TokenBucketRateLimiter({requestsPerSecond: 2, burst: 1});

    await limiter.acquire();
    let released = false;
    const second = limiter.acquire().then(() => { released = true; });
    await vi.advanceTimersByTimeAsync(499);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(released).toBe(true);
  });

  it('pauses the whole bucket after a rate-limit response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new TokenBucketRateLimiter({requestsPerSecond: 10, burst: 2});

    await limiter.acquire();
    limiter.pause(1_000);
    let released = false;
    const pending = limiter.acquire().then(() => { released = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(released).toBe(true);
  });
});

describe('terminal progress', () => {
  it('prints limits, measurable plan details and overall progress', () => {
    let output = '';
    const stream = {
      isTTY: false,
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as Pick<NodeJS.WriteStream, 'write' | 'isTTY'>;
    const progress = new TerminalMigrationProgress(stream, false);
    const summary: MigrationPlanSummary = {
      pages: 2,
      descendants: 1,
      pagesToCreate: 2,
      pagesToUpdate: 0,
      attachments: 1,
      attachmentBytes: 1_024,
      dynamicTables: 1,
      dynamicTableRows: 3,
      renamedPages: 0,
      warnings: 1,
      links: {internal: 2, external: 1, attachments: 1, anchors: 0},
      images: {attached: 1, external: 0},
      staticTables: 2,
      codeBlocks: 1,
    };

    progress.start({
      source: 'root',
      target: '100',
      dryRun: false,
      singlePage: false,
      fresh: false,
      stateFilename: '.states/1234567890abcdef12345678.json',
      orchestrationConcurrency: 4,
      networkLimits: {
        yandex: {apiConcurrency: 4, downloadConcurrency: 2, requestsPerSecond: 8, burst: 8},
        confluence: {readConcurrency: 4, writeConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 8, burst: 10},
      },
    });
    progress.state({
      id: '1234567890abcdef12345678',
      mode: 'automatic',
      filename: '.states/1234567890abcdef12345678.json',
      source: 'existing',
      dryRun: false,
    });
    progress.plan(summary, false);
    for (let index = 0; index < 5; index += 1) {
      progress.item({kind: index === 2 ? 'attachment' : 'page content', status: 'created', label: `item-${index}`});
    }
    progress.finish({
      errors: 0,
      warnings: 1,
      reportPaths: {directory: 'report', html: 'report/index.html', json: 'report/report.json'},
    });

    expect(output).toContain('Network guardrails');
    expect(output).toContain('ywtc · Yandex Wiki');
    expect(output).toContain('Scope   source subtree');
    expect(output).toContain('1234567890abcdef12345678');
    expect(output).toContain('2 total · 1 descendants');
    expect(output).toContain('1 files · ~1.00 KB API estimate');
    expect(output).toContain('100%');
    expect(output).toContain('Migration run completed');
  });

  it('prints an explicit single-page scope', () => {
    let output = '';
    const stream = {
      isTTY: false,
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as Pick<NodeJS.WriteStream, 'write' | 'isTTY'>;

    new TerminalMigrationProgress(stream, false).start({
      source: 'root',
      target: '100',
      dryRun: true,
      singlePage: true,
      fresh: true,
      stateFilename: '.states/1234567890abcdef12345678.json',
      orchestrationConcurrency: 4,
      networkLimits: {
        yandex: {apiConcurrency: 4, downloadConcurrency: 2, requestsPerSecond: 8, burst: 8},
        confluence: {readConcurrency: 4, writeConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 8, burst: 10},
      },
    });

    expect(output).toContain('Scope   single page only');
    expect(output).toContain('Fresh   yes');
  });
});
