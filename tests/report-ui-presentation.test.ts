import {describe, expect, it} from 'vitest';
import {positiveCounts, visibleDetailSections, visibleSummarySections} from '../report-ui/src/presentation.js';
import type {TransferReportData, TransferReportPage} from '../src/report-contract.js';

function summary(): TransferReportData['summary'] {
  return {
    pages: 1,
    returnedDescendants: 0,
    selectedDescendants: 0,
    excludedPages: 0,
    maximumDepth: 0,
    hierarchyGaps: 0,
    hierarchyRepairs: 0,
    complete: 1,
    partial: 0,
    failed: 0,
    blocked: 0,
    conflicts: 0,
    notStartedPages: 0,
    unprocessedPages: 0,
    resources: 0,
    attachments: 0,
    resourceImages: 0,
    resourcesComplete: 0,
    resourcesPartial: 0,
    resourcesFailed: 0,
    resourcesBlocked: 0,
    resourcesNotStarted: 0,
    resourcesPlanned: 0,
    bytes: 0,
    sourceBytes: 0,
    bytesUnknown: 0,
    links: 0,
    images: 0,
    tables: 0,
    grids: 0,
    codeBlocks: 0,
    cycles: 0,
    normalizations: 0,
    adaptations: 0,
    preservedExternalReferences: 0,
    degradations: 0,
    warnings: 0,
    errors: 0,
    rootErrors: 0,
    dependentPages: 0,
    dependentFiles: 0,
    dependentComments: 0,
    retryableFailures: 0,
    inventoryComplete: true,
    inventoriedPages: 1,
    inventoryFailedPages: 0,
    commentThreads: 0,
    comments: 0,
    commentParticipants: 0,
    commentAttachments: 0,
    commentBytes: 0,
    commentStatuses: {
      planned: 0,
      'not-started': 0,
      blocked: 0,
      complete: 1,
      partial: 0,
      failed: 0,
      conflict: 0,
      stale: 0,
      skipped: 0,
    },
    durationMs: 1,
    pageStatuses: {
      discovered: 0,
      planned: 0,
      'skeleton-created': 0,
      'not-started': 0,
      complete: 1,
      partial: 0,
      conflict: 0,
      failed: 0,
      blocked: 0,
    },
    resourceStatuses: {planned: 0, 'not-started': 0, blocked: 0, complete: 0, partial: 0, failed: 0},
    traversalStatuses: {resolved: 0, external: 0, inaccessible: 0, broken: 0, cycle: 0, unsupported: 0},
  };
}

function page(): TransferReportPage {
  return {
    sourceCanonicalId: 'wiki:1',
    sourceId: '1',
    sourceTitle: 'Page',
    sourceUrl: 'https://wiki.example.com/page',
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
  };
}

describe('compact report presentation', () => {
  it('removes zero-valued counters and optional empty summary sections', () => {
    expect(positiveCounts({complete: 1, partial: 0, failed: 0})).toEqual([['complete', 1]]);
    expect(visibleSummarySections(summary())).toEqual(['pages']);
  });

  it('shows only summary sections backed by meaningful data or problems', () => {
    const data = summary();
    data.resources = 2;
    data.resourceStatuses.complete = 2;
    data.commentStatuses.complete = 0;
    data.commentStatuses.failed = 1;
    data.bytesUnknown = 1;
    data.adaptations = 1;
    expect(visibleSummarySections(data)).toEqual(['pages', 'files', 'comments', 'data', 'quality']);
  });

  it('shows mention summaries and details only when occurrences exist', () => {
    const data = summary();
    data.mentionMode = 'auto';
    data.pageMentions = 1;
    data.mentionIdentities = 1;
    data.mentionOutcomes = {total: 1, preserved: 0, native: 1, linked: 0, text: 0, unresolved: 0, failed: 0};
    expect(visibleSummarySections(data)).toEqual(['pages', 'mentions']);

    const withMention = page();
    withMention.mentions = [{
      id: 'mention-0', location: 'page', source: '@ivan', outcome: 'native', label: 'Ivan',
      destinationIdentity: {accountId: 'cloud-42'}, retryable: false,
    }];
    expect(visibleDetailSections({page: withMention, hasPreview: false, issueCount: 0})).toEqual(['overview', 'mentions']);
  });

  it('hides empty page-detail categories and reveals each populated category', () => {
    const data = page();
    expect(visibleDetailSections({page: data, hasPreview: false, issueCount: 0})).toEqual(['overview']);

    data.resourceItems.push({sourceId: 'file', sourceName: 'manual.pdf', kind: 'attachment', status: 'complete'});
    data.comments = {...data.comments, comments: 1, threads: 1};
    expect(visibleDetailSections({page: data, hasPreview: true, issueCount: 1})).toEqual([
      'overview',
      'files',
      'comments',
      'comparison',
      'issues',
    ]);
  });

  it('shows a comments category for a zero-count failed archive', () => {
    const data = page();
    data.comments = {...data.comments, status: 'failed', error: 'provider rejected the archive'};
    expect(visibleDetailSections({page: data, hasPreview: false, issueCount: 0})).toEqual(['overview', 'comments']);
  });
});
