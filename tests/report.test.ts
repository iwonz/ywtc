import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {listReports} from '../src/report-catalog.js';
import {TransferReport, type TransferReportData, type TransferReportPage} from '../src/report.js';

function page(input: Partial<TransferReportPage> & Pick<TransferReportPage, 'sourceCanonicalId' | 'sourceId' | 'sourceTitle' | 'status'>): TransferReportPage {
  return {
    sourceUrl: `https://wiki.example.com/${input.sourceId}`,
    depth: 0,
    inventoryStatus: 'complete',
    resources: 0,
    resourceItems: [],
    sourceBytes: 0,
    transferredBytes: 0,
    bytesUnknown: 0,
    links: 0,
    images: 0,
    tables: 0,
    grids: 0,
    codeBlocks: 0,
    degraded: false,
    resourceFallbacks: [],
    warnings: [],
    normalizations: [],
    ...input,
  };
}

describe('transfer report', () => {
  it('reconciles source inventory, exact outcomes, issue context, HTML, JSON, and catalog counts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-'));
    const report = new TransferReport({
      dryRun: false,
      scope: 'subtree',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example.com/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10', url: 'https://docs.example.com/pages/10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete', links: 3, images: 1, tables: 1,
      resources: 1, sourceBytes: 7, transferredBytes: 7,
      resourceItems: [{sourceId: 'image', sourceName: 'image.png', kind: 'image', status: 'complete', sourceBytes: 7, transferredBytes: 7, destinationName: 'image.png'}],
    }), {source: '<p>private source preview</p>', destination: '<p>private destination preview</p>'});
    report.addPage(page({
      sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Partial child', status: 'partial', depth: 1, parentId: 'wiki:1', degraded: true,
      resources: 2, sourceBytes: 9, transferredBytes: 0, bytesUnknown: 1,
      resourceItems: [
        {sourceId: 'manual', sourceName: 'manual.pdf', kind: 'attachment', status: 'failed', sourceBytes: 9, destinationName: 'manual.pdf', error: 'upload failed'},
        {sourceId: 'unknown', sourceName: 'unknown.bin', kind: 'attachment', status: 'planned', destinationName: 'unknown.bin'},
      ],
      resourceFallbacks: [{name: 'manual.pdf', error: 'upload failed'}],
      warnings: ['Formatting was simplified'],
    }));
    report.addPage(page({
      sourceCanonicalId: 'wiki:3', sourceId: '3', sourceTitle: 'Inventory failure', status: 'failed', inventoryStatus: 'failed', error: 'resource inventory failed',
    }));
    report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: '\u001B[31mupload failed\u001B[0m'});
    report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: '\u001B[31mupload failed\u001B[0m'});
    report.setEdges([]);
    report.finish('partial');
    const paths = await report.write(directory);
    const json = JSON.parse(await readFile(paths.json, 'utf8')) as TransferReportData;
    const html = await readFile(paths.html, 'utf8');

    expect(json).not.toHaveProperty('version');
    expect(json.summary).toMatchObject({
      pages: 3, complete: 1, partial: 1, failed: 1, blocked: 0, conflicts: 0, unprocessedPages: 0,
      resources: 3, attachments: 2, resourceImages: 1, resourcesComplete: 1, resourcesFailed: 1, resourcesPlanned: 1,
      sourceBytes: 16, bytes: 7, bytesUnknown: 1, links: 3, images: 1, tables: 1,
      inventoryComplete: false, inventoriedPages: 2, inventoryFailedPages: 1,
      pageStatuses: {complete: 1, partial: 1, failed: 1},
      resourceStatuses: {complete: 1, failed: 1, planned: 1},
      warnings: 0, degradations: 1, errors: 1,
    });
    expect(Object.values(json.summary.pageStatuses).reduce((total, value) => total + value, 0)).toBe(json.summary.pages);
    expect(Object.values(json.summary.resourceStatuses).reduce((total, value) => total + value, 0)).toBe(json.summary.resources);
    expect(json.issues).toHaveLength(2);
    expect(json.issues.find((issue) => issue.code === 'resource-transfer-failed')).toMatchObject({
      pageTitle: 'Partial child', resourceName: 'manual.pdf', retryable: true, occurrences: 2,
    });
    expect(JSON.stringify(json)).not.toContain('\u001b');
    expect(JSON.stringify(json)).not.toContain('private source preview');
    expect(JSON.stringify(json)).not.toContain('private destination preview');
    expect(html).toContain('Source scope inventory');
    expect(html).toContain('Transfer outcomes');
    expect(html).toContain('Needs attention');
    expect(html).toContain('1 errors');
    expect(html).toContain('0 warnings');
    expect(html).toContain('1 degradations');
    expect(html).toContain('Partial child');
    expect(html).toContain('manual.pdf');
    expect(html).toContain('Repeat the same migration to retry this object.');
    expect(html).toContain('Traversal edges are collected only for');
    expect(html).toContain('download="report.json"');

    const catalog = await listReports(directory);
    expect(catalog.reports[0]).toMatchObject({
      pages: 3, complete: 1, partial: 1, failed: 1, blocked: 0, conflicts: 0,
      resources: 3, resourcesComplete: 1, resourcesFailed: 1, resourcesPlanned: 1,
      inventoryComplete: false, warnings: 0, degradations: 1, errors: 1,
    });
  });

  it('retains linked-scope traversal outcomes independently from content-link metrics', () => {
    const report = new TransferReport({
      dryRun: true,
      scope: 'linked',
      direction: 'confluence → markdown',
      source: {provider: 'confluence', profile: 'docs', rootId: '1', title: 'Root', url: 'https://docs.example.com/pages/1'},
      destination: {provider: 'filesystem', id: '/tmp/export', format: 'markdown'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    report.addPage(page({sourceCanonicalId: 'docs:1', sourceId: '1', sourceTitle: 'Root', status: 'planned', links: 9}));
    report.setEdges([
      {from: 'docs:1', to: 'docs:2', raw: '/pages/2', status: 'resolved'},
      {from: 'docs:2', to: 'docs:1', raw: '/pages/1', status: 'cycle'},
      {from: 'docs:1', raw: '/missing', status: 'broken', message: 'not found'},
    ]);
    report.finish('completed-with-warnings');
    expect(report.data.summary).toMatchObject({
      links: 9, cycles: 1,
      traversalStatuses: {resolved: 1, cycle: 1, broken: 1},
    });
  });
});
