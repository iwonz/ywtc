import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {listReports} from '../src/report-catalog.js';
import {REPORT_DATA_MARKER, TransferReport, type TransferReportData, type TransferReportPage} from '../src/report.js';

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
    comments: {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
    ...input,
  };
}

describe('transfer report', () => {
  it('deduplicates variable diagnostics through a stable transformation issue code', () => {
    const report = new TransferReport({
      runId: '00000000-0000-4000-8000-000000000001',
      dryRun: false,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example.com/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'partial', degraded: true,
      warnings: ['WARN Variable first_name not found', 'WARN Variable team_name not found'],
    }));
    report.finish('partial');
    expect(report.data.issues).toEqual([
      expect.objectContaining({code: 'content-warning-unresolved-yfm-variable', severity: 'degradation', occurrences: 2}),
    ]);
  });

  it('reconciles source inventory, exact outcomes, issue context, HTML, JSON, and catalog counts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-'));
    const report = new TransferReport({
      runId: '00000000-0000-4000-8000-000000000002',
      secrets: ['top-secret', 'admin@example.com'],
      dryRun: false,
      scope: 'subtree',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example.com/root?token=top-secret&view=1'},
      destination: {provider: 'confluence', profile: 'docs', id: '10', url: 'https://docs.example.com/pages/10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    });
    report.setSelection({
      requestedStatus: 'current', effectiveStatus: 'current', returnedDescendants: 4, selectedDescendants: 2,
      excluded: [{
        id: '4', canonicalId: 'wiki:4', locator: 'root/obsolete', title: 'Obsolete',
        url: 'https://wiki.example.com/root/obsolete', parentId: '1', ancestorIds: ['1'], depth: 1,
        reason: 'source-status', status: 'obsolete', metadataComplete: true,
      }],
      maximumDepth: 1,
      hierarchyGaps: [{pageId: 'wiki:2', missingParentId: 'wiki:4', selectedParentId: 'wiki:1', reason: 'source-status'}],
      notes: ['Only accessible hierarchy pages are visible.'],
    });
    report.addHierarchyRepair({
      sourceCanonicalId: 'wiki:2', mode: 'moved', oldParentId: '10', newParentId: '11',
      oldDestinationId: '20', newDestinationId: '20', verified: true,
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete', links: 3, images: 1, tables: 1,
      adaptations: ['Dynamic table was converted to a complete static table'],
      normalizations: ['Provider normalized equivalent markup'],
      preservedExternalReferences: 1,
      resources: 1, sourceBytes: 7, transferredBytes: 7,
      resourceItems: [{
        sourceId: 'image', sourceName: 'image.png', sourceUrl: 'https://wiki.example.com/download/image.png',
        sourceReference: '/download/image.png', kind: 'image', status: 'complete', sourceBytes: 7, transferredBytes: 7,
        sha256: 'abcdef', destinationName: 'image.png', destinationUrl: 'https://docs.example.com/download/image.png',
      }],
      comments: {
        status: 'complete', threads: 1, comments: 2, participants: 2, attachments: 1, bytes: 512,
        archiveName: 'comments.zip', archiveUrl: 'https://docs.example.com/comments.zip', destinationId: 'comment-1',
        destinationUrl: 'https://docs.example.com/comments/1', preview: 'Архив комментариев из оригинала',
        items: [{threadId: 'thread-1', commentId: 'comment-1', author: 'A. User', createdAt: '2026-10-16T12:00:00Z', outcome: 'complete', sourceUrl: 'https://wiki.example.com/root#comment-comment-1'}],
      },
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
      comments: {status: 'partial', threads: 1, comments: 1, participants: 1, attachments: 0, bytes: 0, error: 'quote fallback used'},
    }));
    report.addPage(page({
      sourceCanonicalId: 'wiki:3', sourceId: '3', sourceTitle: 'Inventory failure', status: 'failed', inventoryStatus: 'failed', error: 'resource inventory failed',
    }));
    report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: '\u001B[31mupload failed\u001B[0m'});
    report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: '\u001B[31mupload failed\u001B[0m'});
    report.output('untrusted-fixture', '</script><script>globalThis.ywtcInjected=true</script> top-secret admin@example.com');
    report.setEdges([]);
    report.finish('partial');
    const paths = await report.write(directory);
    const json = JSON.parse(await readFile(paths.json, 'utf8')) as TransferReportData;
    const html = await readFile(paths.html, 'utf8');

    expect(json.runId).toBe('00000000-0000-4000-8000-000000000002');
    expect(path.basename(path.dirname(paths.html))).toBe(json.runId);
    expect(json).not.toHaveProperty('version');
    expect(json.excludedPages).toEqual([expect.objectContaining({
      sourceCanonicalId: 'wiki:4', sourceTitle: 'Obsolete', projectedParentId: 'wiki:1', metadataComplete: true,
    })]);
    expect(json.summary).toMatchObject({
      pages: 3, complete: 1, partial: 1, failed: 1, blocked: 0, conflicts: 0, unprocessedPages: 0,
      returnedDescendants: 4, selectedDescendants: 2, excludedPages: 1, maximumDepth: 1, hierarchyGaps: 1, hierarchyRepairs: 1,
      resources: 3, attachments: 2, resourceImages: 1, resourcesComplete: 1, resourcesFailed: 1, resourcesNotStarted: 1, resourcesPlanned: 0,
      sourceBytes: 16, bytes: 7, bytesUnknown: 1, links: 3, images: 1, tables: 1,
      inventoryComplete: false, inventoriedPages: 2, inventoryFailedPages: 1,
      commentThreads: 2, comments: 3, commentParticipants: 3, commentAttachments: 1, commentBytes: 512,
      commentStatuses: {complete: 2, partial: 1},
      pageStatuses: {complete: 1, partial: 1, failed: 1},
      resourceStatuses: {complete: 1, failed: 1, 'not-started': 1, planned: 0},
      warnings: 0, degradations: 1, adaptations: 1, normalizations: 1, preservedExternalReferences: 1, errors: 1,
    });
    expect(Object.values(json.summary.pageStatuses).reduce((total, value) => total + value, 0)).toBe(json.summary.pages);
    expect(Object.values(json.summary.resourceStatuses).reduce((total, value) => total + value, 0)).toBe(json.summary.resources);
    expect(json.issues).toHaveLength(4);
    expect(json.issues.find((issue) => issue.code === 'resource-transfer-failed')).toMatchObject({
      pageTitle: 'Partial child', resourceName: 'manual.pdf', retryable: true, occurrences: 2,
    });
    expect(JSON.stringify(json)).not.toContain('\u001b');
    expect(JSON.stringify(json)).not.toContain('private source preview');
    expect(JSON.stringify(json)).not.toContain('private destination preview');
    expect(JSON.stringify(json)).not.toContain('top-secret');
    expect(JSON.stringify(json)).not.toContain('admin@example.com');
    expect(json.source.url).toContain('view=1');
    expect(json.source.url).toContain('%5BREDACTED%5D');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('id="root"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain(REPORT_DATA_MARKER);
    expect(html).not.toContain('</script><script>globalThis.ywtcInjected=true</script>');
    expect(html).toContain('\\u003c/script\\u003e\\u003cscript\\u003eglobalThis.ywtcInjected=true\\u003c/script\\u003e');
    expect(html).toContain('Transfer report');
    expect(html).toContain('Page hierarchy');
    expect(html).toContain('Obsolete');
    expect(html).toContain('Partial child');
    expect(html).toContain('manual.pdf');
    expect(html).toContain('comments.zip');
    expect(html).toContain('comment-1');
    expect(html).toContain('Repeat the same migration to retry this object.');
    expect(html).toContain('report.json');

    const catalog = await listReports(directory);
    expect(catalog.reports[0]).toMatchObject({
      runId: json.runId,
      pages: 3, complete: 1, partial: 1, failed: 1, blocked: 0, conflicts: 0,
      sourceStatus: 'current', returnedDescendants: 4, selectedDescendants: 2, excludedPages: 1, hierarchyGaps: 1, hierarchyRepairs: 1,
      resources: 3, resourcesComplete: 1, resourcesFailed: 1, resourcesNotStarted: 1, resourcesPlanned: 0,
      inventoryComplete: false, warnings: 0, degradations: 1, adaptations: 1, preservedExternalReferences: 1, errors: 1,
      commentThreads: 2, comments: 3, commentParticipants: 3, commentAttachments: 1, commentBytes: 512,
      commentStatuses: {complete: 2, partial: 1},
    });
  });

  it('retains linked-scope traversal outcomes independently from content-link metrics', () => {
    const report = new TransferReport({
      runId: '00000000-0000-4000-8000-000000000003',
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

  it('reserves planned for dry-run and converts untouched live work to not-started', () => {
    const make = (dryRun: boolean) => new TransferReport({
      runId: dryRun ? '00000000-0000-4000-8000-000000000004' : '00000000-0000-4000-8000-000000000005',
      dryRun,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    const dryRun = make(true);
    dryRun.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'planned',
      resources: 1, resourceItems: [{sourceId: 'a', sourceName: 'a.pdf', kind: 'attachment', status: 'planned'}],
      comments: {status: 'planned', threads: 1, comments: 1, participants: 1, attachments: 0, bytes: 0},
    }));
    dryRun.finish('completed');
    expect(dryRun.data.summary).toMatchObject({resourcesPlanned: 1, resourcesNotStarted: 0, commentStatuses: {planned: 1}});

    const live = make(false);
    live.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'planned',
      resources: 1, resourceItems: [{sourceId: 'a', sourceName: 'a.pdf', kind: 'attachment', status: 'planned'}],
      comments: {status: 'planned', threads: 1, comments: 1, participants: 1, attachments: 0, bytes: 0},
    }));
    live.finish('cancelled');
    expect(live.data.pages[0]).toMatchObject({status: 'not-started', resourceItems: [{status: 'not-started'}], comments: {status: 'not-started'}});
    expect(live.data.summary).toMatchObject({notStartedPages: 1, resourcesNotStarted: 1, resourcesPlanned: 0});
  });

  it('keeps root errors separate from causal dependency blocks across JSON, HTML, and catalog', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-causal-report-'));
    const report = new TransferReport({
      runId: '00000000-0000-4000-8000-000000000006',
      dryRun: false,
      scope: 'subtree',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'failed', error: 'all titles occupied',
      resources: 1,
      resourceItems: [{
        sourceId: 'a', sourceName: 'a.pdf', kind: 'attachment', status: 'blocked',
        blockedByPageId: 'wiki:1', blockedByCode: 'destination-page-staging-failed',
      }],
      comments: {
        status: 'blocked', threads: 1, comments: 2, participants: 2, attachments: 0, bytes: 0,
        blockedByPageId: 'wiki:1', blockedByCode: 'destination-page-staging-failed',
      },
    }));
    report.addPage(page({
      sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Child', status: 'blocked', depth: 1,
      blockedByPageId: 'wiki:1', blockedByCode: 'destination-page-staging-failed', blockedReason: 'parent unavailable',
    }));
    report.issue({code: 'destination-page-staging-failed', severity: 'error', phase: 'page', pageId: 'wiki:1', retryable: true, message: 'all titles occupied'});
    report.issue({
      code: 'destination-parent-unavailable', severity: 'blocked', phase: 'page', pageId: 'wiki:2', retryable: false,
      blockedByPageId: 'wiki:1', blockedByCode: 'destination-page-staging-failed', message: 'parent unavailable',
    });
    report.finish('partial');
    const paths = await report.write(directory);
    const html = await readFile(paths.html, 'utf8');
    const catalog = await listReports(directory);
    expect(report.data.summary).toMatchObject({
      errors: 1, rootErrors: 1, dependentPages: 1, dependentFiles: 1, dependentComments: 1,
      failed: 1, blocked: 1, resourcesBlocked: 1, resourcesPlanned: 0,
    });
    expect(html).toContain('destination-page-staging-failed');
    expect(html).toContain('parent unavailable');
    expect(catalog.reports[0]).toMatchObject({
      errors: 1, rootErrors: 1, dependentPages: 1, dependentFiles: 1, dependentComments: 1,
      resourcesBlocked: 1, resourcesPlanned: 0,
    });
  });
});
