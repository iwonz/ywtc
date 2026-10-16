import type {ReportPresentationStatus, TransferReportData, TransferReportExcludedPage, TransferReportPage} from '../../src/report-contract.js';

export type ReportTreeFilter = 'all' | 'problems' | 'partial' | 'failed' | 'blocked' | 'conflict' | 'excluded';

export interface ReportTreeNode {
  id: string;
  title: string;
  status: ReportPresentationStatus;
  parentId?: string;
  depth: number;
  page?: TransferReportPage;
  excluded?: TransferReportExcludedPage;
  synthetic?: 'unknown-position';
  children: string[];
  searchable: string;
}

export interface ReportTree {
  nodes: Map<string, ReportTreeNode>;
  roots: string[];
  unknownRootId?: string;
}

const problematicStatuses = new Set<ReportPresentationStatus>(['partial', 'failed', 'blocked', 'conflict', 'not-started', 'excluded']);

function byTitle(nodes: Map<string, ReportTreeNode>) {
  return (left: string, right: string) => (nodes.get(left)?.title ?? left).localeCompare(nodes.get(right)?.title ?? right);
}

function pageSearchText(report: TransferReportData, page: TransferReportPage): string {
  const issues = report.issues.filter((issue) => issue.pageId === page.sourceCanonicalId);
  return [
    page.sourceTitle,
    page.sourceId,
    page.sourceCanonicalId,
    page.destinationId,
    page.destinationTitle,
    page.error,
    page.resourceItems.map((resource) => `${resource.sourceName} ${resource.destinationName ?? ''} ${resource.error ?? ''}`).join(' '),
    page.comments.error,
    page.comments.items?.map((comment) => `${comment.commentId} ${comment.author} ${comment.error ?? ''}`).join(' '),
    issues.map((issue) => `${issue.code} ${issue.category} ${issue.message}`).join(' '),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

export function buildReportTree(report: TransferReportData): ReportTree {
  const nodes = new Map<string, ReportTreeNode>();
  for (const page of report.pages) {
    nodes.set(page.sourceCanonicalId, {
      id: page.sourceCanonicalId,
      title: page.sourceTitle,
      status: page.status,
      ...(page.projectedParentId ?? page.parentId ? {parentId: page.projectedParentId ?? page.parentId} : {}),
      depth: page.depth,
      page,
      children: [],
      searchable: pageSearchText(report, page),
    });
  }
  for (const page of report.excludedPages) {
    nodes.set(page.sourceCanonicalId, {
      id: page.sourceCanonicalId,
      title: page.sourceTitle,
      status: 'excluded',
      ...(page.projectedParentId ? {parentId: page.projectedParentId} : {}),
      depth: page.depth ?? 0,
      excluded: page,
      children: [],
      searchable: `${page.sourceTitle} ${page.sourceId} ${page.sourceCanonicalId} ${page.sourceStatus ?? ''} ${page.reason}`.toLocaleLowerCase(),
    });
  }

  const unknown = [...nodes.values()].filter((node) => node.excluded && (!node.parentId || !nodes.has(node.parentId)));
  let unknownRootId: string | undefined;
  if (unknown.length > 0) {
    unknownRootId = '__ywtc-unknown-position__';
    nodes.set(unknownRootId, {
      id: unknownRootId,
      title: 'unknown-position',
      status: 'excluded',
      depth: 0,
      synthetic: 'unknown-position',
      children: [],
      searchable: 'unknown position excluded',
    });
    for (const node of unknown) node.parentId = unknownRootId;
  }

  const roots: string[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId) && node.parentId !== node.id) nodes.get(node.parentId)!.children.push(node.id);
    else roots.push(node.id);
  }
  const sort = byTitle(nodes);
  roots.sort((left, right) => {
    if (left === unknownRootId) return 1;
    if (right === unknownRootId) return -1;
    return (nodes.get(left)?.depth ?? 0) - (nodes.get(right)?.depth ?? 0) || sort(left, right);
  });
  for (const node of nodes.values()) node.children.sort(sort);

  const visited = new Set<string>();
  const assignFrom = (id: string, depth: number): void => {
    const stack: Array<{id: string; depth: number}> = [{id, depth}];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const node = nodes.get(current.id);
      if (!node) continue;
      node.depth = current.depth;
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({id: node.children[index]!, depth: current.depth + 1});
      }
    }
  };
  for (const root of roots) assignFrom(root, 0);
  for (const node of nodes.values()) {
    if (visited.has(node.id)) continue;
    delete node.parentId;
    roots.push(node.id);
    assignFrom(node.id, 0);
  }
  return {nodes, roots, ...(unknownRootId ? {unknownRootId} : {})};
}

function matchesFilter(node: ReportTreeNode, filter: ReportTreeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'problems') return problematicStatuses.has(node.status);
  return node.status === filter;
}

export function visibleTreeNodes(
  tree: ReportTree,
  expanded: ReadonlySet<string>,
  filter: ReportTreeFilter,
  search: string,
): ReportTreeNode[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtering = filter !== 'all' || normalizedSearch.length > 0;
  const matches = new Set<string>();
  if (filtering) {
    for (const node of tree.nodes.values()) {
      if (!matchesFilter(node, filter)) continue;
      if (normalizedSearch && !node.searchable.includes(normalizedSearch)) continue;
      matches.add(node.id);
      let parent = node.parentId;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        matches.add(parent);
        parent = tree.nodes.get(parent)?.parentId;
      }
    }
  }

  const visible: ReportTreeNode[] = [];
  const stack = [...tree.roots].reverse().map((id) => ({id, ancestorsVisible: true}));
  while (stack.length > 0) {
    const current = stack.pop()!;
    const node = tree.nodes.get(current.id);
    if (!node) continue;
    const included = !filtering || matches.has(current.id);
    if (included && current.ancestorsVisible) visible.push(node);
    const showChildren = filtering ? included : current.ancestorsVisible && expanded.has(current.id);
    if (!showChildren) continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push({id: node.children[index]!, ancestorsVisible: current.ancestorsVisible && included});
    }
  }
  return visible;
}

export function problemCount(report: TransferReportData): number {
  return report.summary.partial
    + report.summary.failed
    + report.summary.blocked
    + report.summary.conflicts
    + report.summary.notStartedPages
    + report.summary.excludedPages;
}
