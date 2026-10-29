import {mkdtemp, readFile, readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {listReports} from '../src/report-catalog.js';
import {
  injectReportPayload,
  REPORT_DATA_MARKER,
  TransferReport,
  type ReportPresentationPayload,
  type TransferReportData,
  type TransferReportPage,
} from '../src/report.js';

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
  it('emits typed verified object outcomes and redacted diagnostics', () => {
    const events: import('../src/operation-events.js').OperationEvent[] = [];
    const report = new TransferReport({runId: '10000000-0000-4000-8000-000000000098', dryRun: false, scope: 'page', direction: 'yandex-wiki → confluence', secrets: ['secret-value'], source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'}, destination: {provider: 'confluence', profile: 'docs', id: '10'}, state: {id: 'state', path: '/tmp/state.json', mode: 'automatic', source: 'new'}}, event => events.push(event));
    report.addPage(page({sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete'}));
    report.issue({code: 'test-error', severity: 'error', phase: 'page', pageId: 'wiki:1', retryable: true, message: 'bad secret-value'});
    expect(events).toContainEqual({type: 'outcome', objectType: 'page', objectId: 'wiki:1', status: 'complete'});
    expect(JSON.stringify(events)).not.toContain('secret-value');
    expect(events.at(-1)).toMatchObject({type: 'diagnostic', code: 'test-error', retryable: true});
  });
  it('injects arbitrary report data without interpreting replacement metacharacters', () => {
    const shell = `<!doctype html><html><body><script id="data" type="application/json">${REPORT_DATA_MARKER}</script></body></html>`;
    const dangerous = String.raw`literal $& $' $\` </script> \u2028 \u2029`;
    const payload = {
      report: {outputs: [{label: 'source', value: dangerous}]},
      previews: {'wiki:1': {source: dangerous, destination: dangerous}},
    } as unknown as ReportPresentationPayload;

    const html = injectReportPayload(shell, payload);
    const serialized = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];

    expect(html.match(/<\/body>/g)).toHaveLength(1);
    expect(html.match(/<\/html>/g)).toHaveLength(1);
    expect(html).not.toContain(REPORT_DATA_MARKER);
    expect(serialized).toBeDefined();
    expect(JSON.parse(serialized!)).toEqual(payload);
  });

  it('defers oversized previews for complete pages instead of inflating the report shell', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-large-preview-'));
    const report = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000099',
      dryRun: false,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    const source = `<p>${'source-preview '.repeat(20_000)}</p>`;
    const destination = `<p>${'destination-preview '.repeat(20_000)}</p>`;
    report.addPage(page({sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete'}), {source, destination});
    report.finish('completed');

    const paths = await report.write(directory);
    const html = await readFile(paths.html, 'utf8');
    const previewDirectory = path.join(paths.directory, 'previews');
    const previewFiles = await readdir(previewDirectory);

    expect(previewFiles).toHaveLength(2);
    expect(await readFile(path.join(previewDirectory, previewFiles.find((name) => name.endsWith('-source.txt'))!), 'utf8')).toBe(source);
    expect(await readFile(path.join(previewDirectory, previewFiles.find((name) => name.endsWith('-destination.txt'))!), 'utf8')).toBe(destination);
    expect(html).toContain('data-ywtc-preview-truncated');
    expect(html).toContain('previews/');
    expect(html).not.toContain('source-preview '.repeat(20_000));
    expect(html).not.toContain('destination-preview '.repeat(20_000));
  });

  it('caps the aggregate embedded preview budget across large complete migrations', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-many-previews-'));
    const report = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000098',
      dryRun: false,
      scope: 'subtree',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    for (let index = 0; index < 75; index += 1) {
      const body = `<p>${'x'.repeat(60 * 1024)}-unique-tail-${index}</p>`;
      report.addPage(page({sourceCanonicalId: `wiki:${index}`, sourceId: String(index), sourceTitle: `Page ${index}`, status: 'complete'}), {
        source: body,
        destination: body,
      });
    }
    report.finish('completed');

    const paths = await report.write(directory);
    const html = await readFile(paths.html, 'utf8');
    const previewFiles = await readdir(path.join(paths.directory, 'previews'));

    expect(previewFiles.length).toBeGreaterThan(0);
    expect(html).not.toContain('-unique-tail-74');
    expect(html).toContain('data-ywtc-preview-truncated');
  });

  it('reports Grid payload outcomes without inflating file or byte totals', () => {
    const report = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000000',
      dryRun: false,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'partial', grids: 3,
      resourceItems: [
        {sourceId: 'grid-ok', sourceName: 'ok.grid.json', kind: 'grid', status: 'complete'},
        {sourceId: 'grid-failed', sourceName: 'failed.grid.json', kind: 'grid', status: 'failed', error: 'Service unavailable'},
        {sourceId: 'grid-unverified', sourceName: 'unverified.grid.json', kind: 'grid', status: 'partial', error: 'Payload could not be verified'},
      ],
    }));
    report.issue({
      code: 'network-inventory-grid-read', severity: 'error', phase: 'inventory', pageId: 'wiki:1',
      resourceId: 'grid-failed', retryable: true, message: 'Service unavailable',
    });
    report.finish('partial');

    expect(report.data.summary).toMatchObject({
      resources: 0, sourceBytes: 0, bytes: 0, bytesUnknown: 0,
      grids: 3, gridsComplete: 1, gridsFailed: 1,
      gridStatuses: {planned: 0, 'not-started': 0, blocked: 0, complete: 1, partial: 1, failed: 1},
      resourcesComplete: 0, resourcesFailed: 0,
    });
  });

  it('reconciles mention outcomes without making a verified fallback partial', () => {
    const report = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000097',
      dryRun: false,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      mentionMode: 'auto',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    report.addPage(page({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete',
      mentions: [
        {id: 'mention-0', location: 'page', source: '@ivan', outcome: 'native', label: 'Ivan', destinationIdentity: {accountId: 'cloud-42'}, retryable: false},
        {id: 'comment-1-0', location: 'comment', source: '@maria', outcome: 'linked', label: 'Maria', url: 'https://people.example/maria', retryable: false},
        {id: 'mention-2', location: 'page', source: '@unknown', outcome: 'unresolved', label: '@unknown', reason: 'destination-user-not-found', retryable: false},
      ],
    }));
    report.issue({
      code: 'mention-user-unresolved', severity: 'warning', phase: 'page', category: 'mention', objectType: 'mention',
      objectId: 'mention-2', pageId: 'wiki:1', retryable: false, message: 'Mention @unknown used a safe fallback',
    });
    report.finish('completed-with-warnings');

    expect(report.data.pages[0]?.status).toBe('complete');
    expect(report.data.summary).toMatchObject({
      mentionMode: 'auto', pageMentions: 2, commentMentions: 1, mentionIdentities: 3,
      mentionOutcomes: {total: 3, native: 1, linked: 1, unresolved: 1, failed: 0},
      warnings: 1, errors: 0,
    });
  });

  it('merges a retry attempt into the full baseline and records object provenance', () => {
    const baseline = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000001',
      dryRun: false,
      scope: 'subtree',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    });
    baseline.addPage(page({sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete'}));
    baseline.addPage(page({
      sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Child', status: 'partial',
      parentId: 'wiki:1', resources: 1,
      resourceItems: [{sourceId: 'file', sourceName: 'file.pdf', kind: 'attachment', status: 'failed'}],
    }));
    baseline.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'file', retryable: true, message: 'upload failed'});
    baseline.finish('partial');

    const retry = new TransferReport({
      runId: '10000000-0000-4000-8000-000000000002',
      dryRun: false,
      scope: 'subtree',
      direction: baseline.data.direction,
      source: baseline.data.source,
      destination: baseline.data.destination,
      state: baseline.data.state,
      retry: {
        rootRunId: baseline.data.runId, parentRunId: baseline.data.runId, attempt: 1,
        selectedPages: 1, selectedResources: 1, selectedComments: 0, contextPages: 1,
        carriedForward: 1, remainingRetryable: 1, remainingTerminal: 0, preview: false,
      },
    });
    retry.seedRetryBaseline(baseline.data, new Set(['wiki:2']));
    retry.addPage(page({
      sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Child', status: 'complete',
      parentId: 'wiki:1', resources: 1,
      resourceItems: [{sourceId: 'file', sourceName: 'file.pdf', kind: 'attachment', status: 'complete'}],
    }));
    retry.finish('completed');

    expect(retry.data.pages).toEqual([
      expect.objectContaining({sourceCanonicalId: 'wiki:1', attemptedInRun: false, outcomeRunId: baseline.data.runId}),
      expect.objectContaining({
        sourceCanonicalId: 'wiki:2', attemptedInRun: true, outcomeRunId: retry.data.runId,
        resourceItems: [expect.objectContaining({attemptedInRun: true, outcomeRunId: retry.data.runId})],
      }),
    ]);
    expect(retry.data.issues).toEqual([]);
    expect(retry.data.summary).toMatchObject({complete: 2, partial: 0, errors: 0});
    expect(retry.data.retry).toMatchObject({remainingRetryable: 0, remainingTerminal: 0});
  });

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

  it('retains recovered diagnostics without counting or retrying them as unresolved failures', () => {
    const report = new TransferReport({
      runId: '00000000-0000-4000-8000-000000000019',
      dryRun: false,
      scope: 'page',
      direction: 'yandex-wiki → confluence',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example.com/root'},
      destination: {provider: 'confluence', profile: 'docs', id: '10'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    });
    report.addPage(page({sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', status: 'complete'}));
    report.issue({
      code: 'destination-consistency-retry', severity: 'warning', phase: 'verification', pageId: 'wiki:1',
      retryable: true, message: 'temporary read-after-write failure',
    });
    report.resolveIssues({pageId: 'wiki:1', codes: ['destination-consistency-retry']});
    report.finish('completed');

    expect(report.data.issues).toContainEqual(expect.objectContaining({
      code: 'destination-consistency-retry', lifecycle: 'resolved', retryable: false,
    }));
    expect(report.data.summary).toMatchObject({errors: 0, warnings: 0, retryableFailures: 0, recoveredIssues: 1});
    expect(report.data.warnings).toEqual([]);
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
    expect(JSON.stringify(json)).not.toContain('Архив комментариев из оригинала');
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
