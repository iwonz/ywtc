import type {DiscoveredPage, PageGraph, PageGraphEdge, PageReference, SourceAdapter, SourcePage, TransferScope} from './domain.js';

export interface DiscoveryProgress {
  pages: number;
  edges: number;
  active?: string;
}

function byCanonicalPage(left: SourcePage, right: SourcePage): number {
  return left.canonicalId.localeCompare(right.canonicalId);
}

function edgeStatusForReference(reference: PageReference): PageGraphEdge['status'] {
  if (reference.kind === 'external' || reference.kind === 'attachment' || reference.kind === 'anchor') return 'external';
  return reference.kind === 'unsupported' ? 'unsupported' : 'broken';
}

export async function discoverPageGraph(input: {
  adapter: SourceAdapter;
  root: SourcePage;
  scope: TransferScope;
  signal?: AbortSignal;
  onProgress?: (progress: DiscoveryProgress) => void;
}): Promise<PageGraph> {
  const {adapter, root, scope, signal, onProgress} = input;
  const selected = new Map<string, SourcePage>([[root.canonicalId, root]]);
  const edges: PageGraphEdge[] = [];
  const warnings: string[] = [];

  if (scope === 'subtree') {
    const descendants = (await adapter.getDescendants(root)).sort(byCanonicalPage);
    for (const page of descendants) {
      if (signal?.aborted) throw signal.reason ?? new Error('Discovery cancelled');
      selected.set(page.canonicalId, page);
    }
  } else if (scope === 'linked') {
    const queue: SourcePage[] = [root];
    let queueIndex = 0;
    const expanded = new Set<string>();
    while (queueIndex < queue.length) {
      if (signal?.aborted) throw signal.reason ?? new Error('Discovery cancelled');
      const page = queue[queueIndex++]!;
      if (expanded.has(page.canonicalId)) continue;
      expanded.add(page.canonicalId);
      const references = [...page.references].sort((left, right) => left.raw.localeCompare(right.raw));
      for (const reference of references) {
        if (reference.kind !== 'page') {
          edges.push({from: page.canonicalId, raw: reference.raw, status: edgeStatusForReference(reference)});
          continue;
        }
        if (reference.href && /^https?:\/\//i.test(reference.href)) {
          const target = new URL(reference.href);
          const origin = new URL(page.url).origin;
          if (target.origin !== origin) {
            edges.push({from: page.canonicalId, raw: reference.raw, status: 'external'});
            continue;
          }
        }
        try {
          const resolved = await adapter.resolveReference(page, reference);
          if (!resolved) {
            edges.push({from: page.canonicalId, raw: reference.raw, status: 'broken'});
            continue;
          }
          const alreadySelected = selected.has(resolved.canonicalId);
          edges.push({
            from: page.canonicalId,
            to: resolved.canonicalId,
            raw: reference.raw,
            status: alreadySelected && expanded.has(resolved.canonicalId) ? 'cycle' : 'resolved',
          });
          if (!alreadySelected) {
            selected.set(resolved.canonicalId, resolved);
            queue.push(resolved);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const inaccessible = /\b(?:401|403|forbidden|permission|access)\b/i.test(message);
          edges.push({from: page.canonicalId, raw: reference.raw, status: inaccessible ? 'inaccessible' : 'broken', message});
          warnings.push(`${page.title}: cannot follow ${reference.raw}: ${message}`);
        }
      }
      onProgress?.({pages: selected.size, edges: edges.length, active: page.title});
    }
  }

  const selectedByProviderId = new Map([...selected.values()].map((page) => [page.id, page]));
  const projected = new Map<string, string | undefined>();
  projected.set(root.canonicalId, undefined);
  for (const page of selected.values()) {
    if (page.canonicalId === root.canonicalId) continue;
    const sourceParent = page.parentId ? selectedByProviderId.get(page.parentId) : undefined;
    projected.set(page.canonicalId, sourceParent?.canonicalId ?? root.canonicalId);
  }

  // A malformed vendor hierarchy must never make creation order impossible.
  // Break the first cycle encountered from each node by attaching that node to
  // the selected root; link-graph cycles remain recorded independently above.
  for (const page of selected.values()) {
    if (page.canonicalId === root.canonicalId) continue;
    const seen = new Set<string>();
    let current: string | undefined = page.canonicalId;
    while (current && current !== root.canonicalId) {
      if (seen.has(current)) {
        projected.set(page.canonicalId, root.canonicalId);
        warnings.push(`Hierarchy cycle detected at ${page.title}; attached below the root.`);
        break;
      }
      seen.add(current);
      current = projected.get(current);
    }
  }

  const depths = new Map<string, number>([[root.canonicalId, 0]]);
  const depthOf = (id: string): number => {
    if (id === root.canonicalId) return 0;
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const parent = projected.get(id);
    const depth = parent ? depthOf(parent) + 1 : 0;
    depths.set(id, depth);
    return depth;
  };

  const pages = [...selected.values()].map<DiscoveredPage>((page) => {
    const projectedParentId = projected.get(page.canonicalId);
    return {...page, depth: depthOf(page.canonicalId), ...(projectedParentId ? {projectedParentId} : {})};
  }).sort((left, right) => left.depth - right.depth || left.canonicalId.localeCompare(right.canonicalId));

  onProgress?.({pages: pages.length, edges: edges.length});
  return {rootId: root.canonicalId, pages, edges, warnings};
}
