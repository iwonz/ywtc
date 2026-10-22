import {describe, expect, it} from 'vitest';
import {buildRetryPlan} from '../src/retry-plan.js';
import type {TransferReportData, TransferReportIssue, TransferReportPage} from '../src/report-contract.js';

function page(id: string, input: Partial<TransferReportPage> = {}): TransferReportPage {
  return {
    sourceCanonicalId: id,
    sourceId: id,
    sourceTitle: id,
    sourceUrl: `https://wiki.example.com/${id}`,
    depth: 0,
    status: 'complete',
    inventoryStatus: 'complete',
    resources: 0,
    resourceItems: [],
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
    ...input,
  };
}

function issue(input: Omit<Partial<TransferReportIssue>, 'code' | 'pageId'> & {code: string; pageId: string}): TransferReportIssue {
  const {code, pageId, ...overrides} = input;
  return {
    code,
    pageId,
    severity: 'error',
    phase: 'page',
    category: 'provider-api',
    objectType: 'page',
    retryable: false,
    message: input.code,
    occurrences: 1,
    action: 'Retry',
    ...overrides,
  };
}

function report(pages: TransferReportPage[], issues: TransferReportIssue[] = []): TransferReportData {
  return {
    runId: '11111111-1111-4111-8111-111111111111',
    startedAt: '2026-10-21T10:00:00.000Z',
    finishedAt: '2026-10-21T10:01:00.000Z',
    status: 'partial',
    dryRun: false,
    commentsEnabled: true,
    scope: 'subtree',
    sourceStatus: 'all',
    selection: {requestedStatus: 'all', effectiveStatus: 'all', returnedDescendants: pages.length - 1, selectedDescendants: pages.length - 1, excluded: [], maximumDepth: 2, hierarchyGaps: [], notes: []},
    direction: 'yandex-wiki → confluence',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: 'root', title: 'Root', url: 'https://wiki.example.com/root'},
    destination: {provider: 'confluence', profile: 'confluence', id: '100', url: 'https://conf.example.com/pages/100'},
    state: {id: 'state', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
    pages,
    excludedPages: [],
    edges: [],
    hierarchyRepairs: [],
    warnings: [],
    errors: [],
    issues,
    outputs: [],
    summary: {inventoryComplete: true, inventoryRemainingFailures: 0} as TransferReportData['summary'],
  };
}

describe('targeted retry planner', () => {
  it('selects retryable failures, their blocked descendants, and read-only ancestors', () => {
    const root = page('root');
    const failed = page('failed', {status: 'failed', parentId: 'root', projectedParentId: 'root'});
    const child = page('child', {
      status: 'blocked', parentId: 'failed', projectedParentId: 'failed',
      blockedByPageId: 'failed', blockedByCode: 'page-transfer-failed',
      resources: 1,
      resourceItems: [{sourceId: 'dependent-file', sourceName: 'dependent.pdf', kind: 'attachment', status: 'blocked'}],
    });
    const plan = buildRetryPlan(report(
      [root, failed, child],
      [issue({code: 'page-transfer-failed', pageId: 'failed', retryable: true})],
    ));
    expect(plan.retryPageIds).toEqual(['failed', 'child']);
    expect(plan.contextPageIds).toEqual(['root']);
    expect(plan.pages.root?.decision).toBe('context');
    expect(plan.pages.child?.reasons).toContain('blocked-by:failed');
    expect(plan.selectedResourceIds.child).toEqual(['dependent-file']);
    expect(plan.remainingTerminal).toBe(0);
  });

  it('retries only failed resources or comment archives when the page body is otherwise reusable', () => {
    const resourceOnly = page('resource', {
      status: 'partial',
      resources: 2,
      resourceItems: [
        {sourceId: 'good', sourceName: 'good.pdf', kind: 'attachment', status: 'complete'},
        {sourceId: 'bad', sourceName: 'bad.pdf', kind: 'attachment', status: 'failed'},
      ],
    });
    const commentsOnly = page('comments', {
      status: 'partial',
      comments: {status: 'failed', threads: 1, comments: 2, participants: 2, attachments: 0, bytes: 0},
    });
    const plan = buildRetryPlan(report([resourceOnly, commentsOnly], [
      issue({
        code: 'resource-transfer-failed', pageId: 'resource', phase: 'resource', objectType: 'resource',
        objectId: 'bad', resourceId: 'bad', retryable: true,
      }),
      issue({code: 'comment-failed', pageId: 'comments', phase: 'comment', objectType: 'comment', retryable: true}),
    ]));
    expect(plan.pages.resource).toMatchObject({retryPage: false, resourceIds: ['bad'], retryComments: false});
    expect(plan.pages.comments).toMatchObject({retryPage: false, resourceIds: [], retryComments: true});
    expect(plan.selectedResourceIds).toEqual({resource: ['bad']});
    expect(plan.selectedCommentPageIds).toEqual(['comments']);
  });

  it('retries comment inventory failures and blocked archives after their page dependency', () => {
    const inventory = page('inventory', {
      status: 'partial',
      comments: {status: 'failed', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
    });
    const failed = page('failed', {
      status: 'failed',
      comments: {status: 'blocked', threads: 2, comments: 3, participants: 2, attachments: 0, bytes: 0},
    });
    const plan = buildRetryPlan(report([inventory, failed], [
      issue({code: 'network-inventory-comments-read', pageId: 'inventory', phase: 'inventory', retryable: true}),
      issue({code: 'destination-page-staging-failed', pageId: 'failed', phase: 'page', retryable: true}),
    ]));
    expect(plan.pages.inventory).toMatchObject({retryPage: false, retryComments: true});
    expect(plan.pages.failed).toMatchObject({retryPage: true, retryComments: true});
    expect(plan.selectedCommentPageIds).toEqual(['inventory', 'failed']);
  });

  it('keeps permanent degradations and ownership conflicts terminal', () => {
    const degraded = page('degraded', {status: 'partial', degraded: true});
    const conflict = page('conflict', {status: 'conflict'});
    const blocked = page('blocked', {status: 'blocked', blockedByPageId: 'conflict'});
    const plan = buildRetryPlan(report([degraded, conflict, blocked], [
      issue({code: 'unsupported-macro', pageId: 'degraded', severity: 'degradation', phase: 'page', category: 'rendering-layout'}),
      issue({code: 'destination-ownership-ambiguity', pageId: 'conflict', retryable: true, category: 'conflict'}),
    ]));
    expect(plan.retryPageIds).toEqual([]);
    expect(plan.pages.degraded?.decision).toBe('terminal');
    expect(plan.pages.conflict?.decision).toBe('terminal');
    expect(plan.pages.blocked?.decision).toBe('terminal');
    expect(plan.remainingTerminal).toBe(3);
  });

  it('uses current typed-code policy and marks incomplete discovery as retry work', () => {
    const failed = page('root', {status: 'failed', inventoryStatus: 'failed'});
    const data = report([failed], [issue({code: 'source-discovery-failed', pageId: 'root', retryable: false})]);
    data.summary.inventoryComplete = false;
    data.summary.inventoryRemainingFailures = 1;
    const plan = buildRetryPlan(data);
    expect(plan.retryPageIds).toEqual(['root']);
    expect(plan.discoveryIncomplete).toBe(true);
  });

  it('does not retry complete objects because of recovered historical diagnostics', () => {
    const complete = page('complete');
    const data = report([complete], [
      issue({
        code: 'destination-consistency-retry', pageId: 'complete', severity: 'normalization',
        phase: 'verification', retryable: false,
      }),
      issue({
        code: 'destination-mapping-recovered', pageId: 'complete', severity: 'normalization',
        phase: 'page', retryable: false,
      }),
    ]);

    const plan = buildRetryPlan(data);

    expect(plan.pages.complete?.decision).toBe('resolved');
    expect(plan.retryPageIds).toEqual([]);
    expect(plan.remainingRetryable).toBe(0);
  });

  it('does not select a resolved retryable issue from the current report lineage', () => {
    const partial = page('partial', {status: 'partial'});
    const data = report([partial], [
      issue({
        code: 'destination-content-verification-failed', pageId: 'partial', severity: 'warning',
        phase: 'verification', retryable: true, lifecycle: 'resolved',
      }),
    ]);

    const plan = buildRetryPlan(data);

    expect(plan.retryPageIds).toEqual([]);
    expect(plan.pages.partial?.decision).toBe('terminal');
    expect(plan.remainingRetryable).toBe(0);
  });
});
