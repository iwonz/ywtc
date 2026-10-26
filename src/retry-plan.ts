import type {TransferReportData, TransferReportIssue, TransferReportPage} from './report-contract.js';

type RetryDecision = 'retry' | 'context' | 'terminal' | 'resolved';

interface RetryPagePlan {
  pageId: string;
  decision: RetryDecision;
  retryPage: boolean;
  resourceIds: string[];
  retryComments: boolean;
  reasons: string[];
}

export interface RetryPlan {
  pages: Record<string, RetryPagePlan>;
  retryPageIds: string[];
  contextPageIds: string[];
  selectedResourceIds: Record<string, string[]>;
  selectedCommentPageIds: string[];
  remainingRetryable: number;
  remainingTerminal: number;
  carriedForward: number;
  discoveryIncomplete: boolean;
}

export interface RetryExecution {
  rootRunId: string;
  parentRunId: string;
  attempt: number;
  baseline: TransferReportData;
  plan: RetryPlan;
}

const currentRetryableCodes = new Set([
  'destination-content-verification-failed',
  'page-transfer-failed',
  'source-discovery-failed',
]);

function retryable(issue: TransferReportIssue): boolean {
  if (issue.lifecycle === 'resolved') return false;
  if (issue.code === 'destination-ownership-ambiguity' || issue.category === 'conflict') return false;
  return issue.retryable || currentRetryableCodes.has(issue.code) || issue.category === 'network' || issue.category === 'rate-limit';
}

function issuesForPage(report: TransferReportData, pageId: string): TransferReportIssue[] {
  return report.issues.filter((issue) => issue.pageId === pageId);
}

function isCommentIssue(issue: TransferReportIssue): boolean {
  return issue.phase === 'comment'
    || issue.objectType === 'comment'
    || issue.code.endsWith('inventory-comments-read');
}

function actionableIssues(issues: TransferReportIssue[], object: 'page' | 'resource' | 'comment', objectId?: string): TransferReportIssue[] {
  return issues.filter((issue) => {
    if (issue.code === 'mention-user-unresolved' || !retryable(issue) || !['error', 'warning'].includes(issue.severity)) return false;
    if (object === 'resource') return issue.resourceId === objectId || (issue.objectType === 'resource' && issue.objectId === objectId);
    if (object === 'comment') return isCommentIssue(issue);
    return !issue.resourceId && !isCommentIssue(issue) && issue.objectType !== 'resource';
  });
}

function incompletePage(page: TransferReportPage): boolean {
  return !['complete'].includes(page.status);
}

function parentId(page: TransferReportPage): string | undefined {
  return page.projectedParentId ?? page.sourceParentId ?? page.parentId;
}

export function buildRetryPlan(report: TransferReportData): RetryPlan {
  const plans = new Map<string, RetryPagePlan>();
  const byId = new Map(report.pages.map((page) => [page.sourceCanonicalId, page]));
  let terminal = 0;

  for (const page of report.pages) {
    const issues = issuesForPage(report, page.sourceCanonicalId);
    const pageIssues = actionableIssues(issues, 'page');
    const retryPage = page.status === 'not-started'
      || (['failed', 'partial'].includes(page.status) && pageIssues.length > 0)
      || page.inventoryStatus === 'failed' && pageIssues.length > 0;
    const resourceIds = page.resourceItems
      .filter((resource) => {
        if (retryPage && ['blocked', 'not-started'].includes(resource.status)) return true;
        if (resource.status === 'not-started') return true;
        if (!['failed', 'partial'].includes(resource.status)) return false;
        return actionableIssues(issues, 'resource', resource.sourceId).length > 0;
      })
      .map((resource) => resource.sourceId);
    const retryComments = page.comments.status === 'not-started'
      || (retryPage && page.comments.status === 'blocked')
      || (['failed', 'partial', 'blocked'].includes(page.comments.status) && actionableIssues(issues, 'comment').length > 0);
    const actionable = retryPage || resourceIds.length > 0 || retryComments;
    const hasIncomplete = incompletePage(page)
      || page.resourceItems.some((resource) => !['complete'].includes(resource.status))
      || !['complete', 'skipped'].includes(page.comments.status);
    const decision: RetryDecision = actionable ? 'retry' : hasIncomplete ? 'terminal' : 'resolved';
    if (decision === 'terminal') terminal += 1;
    plans.set(page.sourceCanonicalId, {
      pageId: page.sourceCanonicalId,
      decision,
      retryPage,
      resourceIds,
      retryComments,
      reasons: [
        ...pageIssues.map((issue) => issue.code),
        ...resourceIds.map((id) => `resource:${id}`),
        ...(retryComments ? ['comments'] : []),
        ...(page.status === 'not-started' ? ['not-started'] : []),
      ],
    });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const page of report.pages) {
      const plan = plans.get(page.sourceCanonicalId)!;
      if (plan.decision !== 'terminal' || page.status !== 'blocked') continue;
      const blocker = page.blockedByPageId ? plans.get(page.blockedByPageId) : undefined;
      if (blocker?.decision !== 'retry') continue;
      plan.decision = 'retry';
      plan.retryPage = true;
      plan.resourceIds = [...new Set([
        ...plan.resourceIds,
        ...page.resourceItems
          .filter((resource) => ['blocked', 'not-started'].includes(resource.status))
          .map((resource) => resource.sourceId),
      ])];
      if (['blocked', 'not-started'].includes(page.comments.status)) plan.retryComments = true;
      plan.reasons.push(`blocked-by:${page.blockedByPageId}`);
      terminal = Math.max(0, terminal - 1);
      changed = true;
    }
  }

  const selected = new Set([...plans.values()].filter((plan) => plan.decision === 'retry').map((plan) => plan.pageId));
  const contexts = new Set<string>();
  for (const id of selected) {
    let current = byId.get(id);
    const seen = new Set<string>();
    while (current) {
      const parent = parentId(current);
      if (!parent || seen.has(parent)) break;
      seen.add(parent);
      if (!selected.has(parent) && byId.has(parent)) contexts.add(parent);
      current = byId.get(parent);
    }
  }
  for (const id of contexts) {
    const plan = plans.get(id);
    if (plan?.decision === 'resolved') plan.decision = 'context';
  }

  const selectedPlans = [...plans.values()].filter((plan) => plan.decision === 'retry');
  return {
    pages: Object.fromEntries(plans),
    retryPageIds: selectedPlans.map((plan) => plan.pageId),
    contextPageIds: [...contexts],
    selectedResourceIds: Object.fromEntries(selectedPlans.filter((plan) => plan.resourceIds.length > 0).map((plan) => [plan.pageId, plan.resourceIds])),
    selectedCommentPageIds: selectedPlans.filter((plan) => plan.retryComments).map((plan) => plan.pageId),
    remainingRetryable: selectedPlans.length,
    remainingTerminal: terminal,
    carriedForward: [...plans.values()].filter((plan) => plan.decision === 'resolved' || plan.decision === 'context').length,
    discoveryIncomplete: !report.summary.inventoryComplete || (report.summary.inventoryRemainingFailures ?? 0) > 0,
  };
}
