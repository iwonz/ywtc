import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  listReports,
  openReportFile,
  openSelectedReport,
  reportAccessDetails,
  reportOpenCommand,
  selectReport,
} from '../src/report-catalog.js';

const older = '11111111-1111-4111-8111-111111111111';
const newer = '22222222-2222-4222-8222-222222222222';

async function reportBundle(root: string, runId: string, finishedAt: string, retry?: Record<string, unknown>): Promise<void> {
  const directory = path.join(root, runId);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>report</title>');
  await writeFile(path.join(directory, 'report.json'), JSON.stringify({
    runId,
    startedAt: '2026-10-15T10:00:00.000Z',
    finishedAt,
    status: 'partial',
    dryRun: false,
    scope: 'subtree',
    sourceStatus: 'current',
    direction: 'yandex-wiki → confluence',
    ...(retry ? {retry} : {}),
    warnings: ['warning'],
    errors: ['error'],
    summary: {
      pages: 3, complete: 2, partial: 1, failed: 0, blocked: 0, conflicts: 0, unprocessedPages: 0,
      returnedDescendants: 5, selectedDescendants: 2, excludedPages: 3, maximumDepth: 2, hierarchyGaps: 1, hierarchyRepairs: 1,
      resources: 4, resourcesComplete: 3, resourcesPartial: 0, resourcesFailed: 1, resourcesPlanned: 0,
      inventoryComplete: true, degradations: 3, warnings: 4, errors: 5,
    },
  }));
}

describe('report catalog', () => {
  it('sorts valid report bundles newest first and warns about malformed bundles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-catalog-'));
    await reportBundle(root, older, '2026-10-15T11:00:00.000Z');
    await reportBundle(root, newer, '2026-10-15T12:00:00.000Z');
    await mkdir(path.join(root, 'broken'));
    const catalog = await listReports(root);
    expect(catalog.reports.map((report) => report.runId)).toEqual([newer, older]);
    expect(catalog.reports[0]).toMatchObject({
      pages: 3, complete: 2, partial: 1, resources: 4, resourcesComplete: 3, resourcesFailed: 1,
      sourceStatus: 'current', returnedDescendants: 5, selectedDescendants: 2, excludedPages: 3, maximumDepth: 2, hierarchyGaps: 1, hierarchyRepairs: 1,
      inventoryComplete: true, degradations: 3, warnings: 4, errors: 5,
    });
    expect(catalog.reports[0]?.url).toMatch(/^file:/);
    expect(catalog.warnings).toEqual([expect.stringContaining('Skipped report broken')]);
    expect(catalog.warnings[0]).not.toContain('\n');
  });

  it('exposes retry lineage and selection metadata in the report catalog', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-retry-catalog-'));
    await reportBundle(root, newer, '2026-10-15T12:00:00.000Z', {
      rootRunId: older,
      parentRunId: older,
      attempt: 1,
      selectedPages: 2,
      selectedResources: 1,
      selectedComments: 3,
      contextPages: 4,
      carriedForward: 8,
      remainingRetryable: 1,
      remainingTerminal: 2,
      preview: false,
    });
    await expect(listReports(root)).resolves.toMatchObject({
      reports: [{runId: newer, retry: {rootRunId: older, parentRunId: older, attempt: 1, selectedPages: 2}}],
    });
  });

  it('selects latest or explicit reports and rejects traversal and missing IDs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-select-'));
    await reportBundle(root, older, '2026-10-15T11:00:00.000Z');
    await reportBundle(root, newer, '2026-10-15T12:00:00.000Z');
    await expect(selectReport(root)).resolves.toMatchObject({report: {runId: newer}});
    await expect(selectReport(root, 'last')).resolves.toMatchObject({report: {runId: newer}});
    await expect(selectReport(root, older)).resolves.toMatchObject({report: {runId: older}});
    await expect(selectReport(root, '../outside')).rejects.toThrow(/"last" or a canonical UUID/);
    await expect(selectReport(root, '33333333-3333-4333-8333-333333333333')).rejects.toThrow(/was not found/);
  });

  it('formats a copyable workspace-aware open command', () => {
    expect(reportOpenCommand(newer, "/tmp/ywtc user's workspace")).toBe(
      `ywtc reports open ${newer} --workdir '/tmp/ywtc user'\\''s workspace'`,
    );
    expect(() => reportOpenCommand('last', '/tmp/ywtc')).toThrow(/canonical UUID/);
    expect(reportAccessDetails({
      runId: newer,
      directory: `/tmp/reports/${newer}`,
      html: `/tmp/reports/${newer}/index.html`,
      json: `/tmp/reports/${newer}/report.json`,
    }, '/tmp/ywtc')).toEqual({
      runId: newer,
      report: `/tmp/reports/${newer}/index.html`,
      url: `file:///tmp/reports/${newer}/index.html`,
      command: `ywtc reports open ${newer} --workdir '/tmp/ywtc'`,
    });
  });

  it('opens file URLs through an injected opener and reports opener failures with the URL', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-open-'));
    await reportBundle(root, newer, '2026-10-15T12:00:00.000Z');
    const opened: string[] = [];
    await expect(openSelectedReport(root, undefined, async (url) => { opened.push(url); })).resolves.toMatchObject({report: {runId: newer}});
    expect(opened[0]).toMatch(/^file:/);
    await expect(openReportFile(path.join(root, newer, 'index.html'), async () => { throw new Error('no browser'); }))
      .rejects.toThrow(/Open file:.*manually.*no browser/);
  });
});
