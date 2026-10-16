import {describe, expect, it} from 'vitest';
import {buildReportTree, visibleTreeNodes} from '../report-ui/src/model.js';
import type {TransferReportData, TransferReportPage} from '../src/report-contract.js';

function reportPage(index: number, parentId?: string): TransferReportPage {
  const id = `wiki:${index}`;
  return {
    sourceCanonicalId: id,
    sourceId: String(index),
    sourceTitle: index === 9_999 ? 'Needle page' : `Page ${index}`,
    sourceUrl: `https://wiki.example.com/page-${index}`,
    ...(parentId ? {parentId, projectedParentId: parentId} : {}),
    depth: index,
    status: index === 9_999 ? 'failed' : 'complete',
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
    comments: {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
  };
}

function reportData(pages: TransferReportPage[]): TransferReportData {
  return {
    runId: 'run', startedAt: '2026-10-16T00:00:00Z', finishedAt: '2026-10-16T00:01:00Z',
    status: 'partial', dryRun: false, commentsEnabled: true, scope: 'subtree', sourceStatus: 'all',
    selection: {requestedStatus: 'all', effectiveStatus: 'all', returnedDescendants: pages.length - 1, selectedDescendants: pages.length - 1, excluded: [], maximumDepth: pages.length - 1, hierarchyGaps: [], notes: []},
    direction: 'yandex-wiki → confluence',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '0', title: 'Root', url: 'https://wiki.example.com/root'},
    destination: {provider: 'confluence', profile: 'docs', id: '1'},
    state: {id: 'state', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    pages, excludedPages: [], edges: [], hierarchyRepairs: [], warnings: [], errors: [], issues: [], outputs: [],
    summary: {} as TransferReportData['summary'],
  };
}

describe('interactive report tree', () => {
  it('places excluded pages without exposed hierarchy in the explicit unknown-position group', () => {
    const report = reportData([reportPage(0)]);
    report.excludedPages = [{
      sourceCanonicalId: 'wiki:excluded', sourceId: 'excluded', sourceTitle: 'Filtered page', status: 'excluded',
      reason: 'source-status', sourceStatus: 'obsolete', metadataComplete: false,
    }];
    const tree = buildReportTree(report);
    const excluded = tree.nodes.get('wiki:excluded');
    expect(tree.unknownRootId).toBe('__ywtc-unknown-position__');
    expect(excluded?.parentId).toBe(tree.unknownRootId);
  });

  it('keeps every ancestor of a filtered deep match and handles 10,000 pages linearly', () => {
    const pages = Array.from({length: 10_000}, (_, index) => reportPage(index, index > 0 ? `wiki:${index - 1}` : undefined));
    const started = performance.now();
    const tree = buildReportTree(reportData(pages));
    const expanded = new Set(tree.nodes.keys());
    const visible = visibleTreeNodes(tree, expanded, 'failed', 'needle');
    const elapsed = performance.now() - started;
    expect(tree.nodes.size).toBe(10_000);
    expect(visible).toHaveLength(10_000);
    expect(visible.at(-1)?.title).toBe('Needle page');
    expect(elapsed).toBeLessThan(5_000);
  });

  it('searches exact resource and diagnostic details while preserving the page parent', () => {
    const root = reportPage(0);
    const child = reportPage(1, root.sourceCanonicalId);
    child.status = 'partial';
    child.resourceItems = [{sourceId: 'diagram', sourceName: 'diagram.png', kind: 'image', status: 'failed', error: 'image verification mismatch'}];
    const report = reportData([root, child]);
    report.issues = [{
      code: 'resource-transfer-failed', severity: 'error', phase: 'resource', category: 'attachment-image', objectType: 'resource',
      objectId: 'diagram', pageId: child.sourceCanonicalId, resourceId: 'diagram', retryable: true,
      message: 'image verification mismatch', occurrences: 1, action: 'Retry',
    }];
    const tree = buildReportTree(report);
    const visible = visibleTreeNodes(tree, new Set(), 'problems', 'diagram.png');
    expect(visible.map((node) => node.id)).toEqual([root.sourceCanonicalId, child.sourceCanonicalId]);
  });
});
