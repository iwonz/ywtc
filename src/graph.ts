import type {
  DescendantDiscovery,
  DiscoveredPage,
  HierarchyGap,
  PageGraph,
  PageGraphEdge,
  PageReference,
  SourceAdapter,
  SourcePageCheckpoint,
  SourcePage,
  SourceSelection,
  SourceStatus,
  TransferScope,
} from './domain.js';

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

function assertUniquePages(root: SourcePage, pages: SourcePage[]): void {
  const byCanonical = new Map<string, SourcePage>([[root.canonicalId, root]]);
  const byProviderId = new Map<string, SourcePage>([[root.id, root]]);
  for (const page of pages) {
    const canonical = byCanonical.get(page.canonicalId);
    const provider = byProviderId.get(page.id);
    if (canonical && canonical.id !== page.id) {
      throw new Error(`Source page ${page.canonicalId} was returned with conflicting immutable identity`);
    }
    if (provider && provider.canonicalId !== page.canonicalId) {
      throw new Error(`Source page ID ${page.id} was returned with conflicting canonical identity`);
    }
    byCanonical.set(page.canonicalId, page);
    byProviderId.set(page.id, page);
  }
}

function assertSubtreeContainment(root: SourcePage, pages: SourcePage[]): void {
  const rootLocator = root.locator.replace(/^\/+|\/+$/g, '');
  for (const page of pages) {
    if (page.canonicalId === root.canonicalId) continue;
    const ancestorMatch = page.ancestorIds?.includes(root.id) ?? false;
    const locatorMatch = page.provider === 'yandex-wiki'
      && page.locator.replace(/^\/+/, '').startsWith(`${rootLocator}/`);
    if (!ancestorMatch && !locatorMatch) {
      throw new Error(`Source page ${page.id} (${page.locator}) lies outside subtree rooted at ${root.id} (${root.locator})`);
    }
  }
}

function emptyDiscovery(status: SourceStatus): DescendantDiscovery {
  return {pages: [], returned: 0, excluded: [], effectiveStatus: status, notes: []};
}

export async function discoverPageGraph(input: {
  adapter: SourceAdapter;
  root: SourcePage;
  scope: TransferScope;
  sourceStatus?: SourceStatus;
  signal?: AbortSignal;
  onProgress?: (progress: DiscoveryProgress) => void;
  checkpoint?: SourcePageCheckpoint;
}): Promise<PageGraph> {
  const {adapter, root, scope, signal, onProgress, checkpoint} = input;
  const requestedStatus = input.sourceStatus ?? 'all';
  const supportsSourceStatus = adapter.supportsSourceStatus?.(scope, requestedStatus) ?? requestedStatus === 'all';
  if (!supportsSourceStatus) {
    throw new Error(`${adapter.profile.name} (${adapter.kind}) cannot determine --source-status ${requestedStatus} for --scope ${scope}`);
  }
  const selected = new Map<string, SourcePage>([[root.canonicalId, root]]);
  const edges: PageGraphEdge[] = [];
  const warnings: string[] = [];
  let discovery = emptyDiscovery(requestedStatus);

  if (scope === 'subtree') {
    const descendantResult = await adapter.getDescendants(root, {status: requestedStatus, ...(checkpoint ? {checkpoint} : {})});
    discovery = Array.isArray(descendantResult)
      ? {...emptyDiscovery(requestedStatus), pages: descendantResult, returned: descendantResult.length}
      : descendantResult;
    assertUniquePages(root, discovery.pages);
    assertSubtreeContainment(root, discovery.pages);
    for (const page of [...discovery.pages].sort(byCanonicalPage)) {
      if (signal?.aborted) throw signal.reason ?? new Error('Discovery cancelled');
      if (!selected.has(page.canonicalId)) selected.set(page.canonicalId, page);
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
          const cached = reference.pageId ? await checkpoint?.loadPage(reference.pageId) : undefined;
          const resolved = cached ?? await adapter.resolveReference(page, reference);
          if (!resolved) {
            edges.push({from: page.canonicalId, raw: reference.raw, status: 'broken'});
            continue;
          }
          if (!cached) await checkpoint?.savePage(resolved);
          if (requestedStatus === 'current') {
            if (resolved.sourceStatus === undefined) throw new Error(`${adapter.kind} did not expose status for linked page ${resolved.id}`);
            if (resolved.sourceStatus !== 'current') {
              discovery.excluded.push({
                id: resolved.id,
                canonicalId: resolved.canonicalId,
                locator: resolved.locator,
                title: resolved.title,
                url: resolved.url,
                ...(resolved.parentId ? {parentId: resolved.parentId} : {}),
                ...(resolved.ancestorIds?.length ? {ancestorIds: resolved.ancestorIds} : {}),
                discoveredFromId: page.id,
                reason: 'source-status',
                status: 'non-current',
                metadataComplete: true,
              });
              edges.push({from: page.canonicalId, to: resolved.canonicalId, raw: reference.raw, status: 'external', message: 'Excluded by --source-status current'});
              continue;
            }
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
    assertUniquePages(root, [...selected.values()].slice(1));
    discovery.returned = selected.size - 1 + discovery.excluded.length;
  }

  const selectedByProviderId = new Map([...selected.values()].map((page) => [page.id, page]));
  const excludedIds = new Set(discovery.excluded.map((page) => page.id));
  const projected = new Map<string, string | undefined>();
  const hierarchyGaps: HierarchyGap[] = [];
  projected.set(root.canonicalId, undefined);
  for (const page of selected.values()) {
    if (page.canonicalId === root.canonicalId) continue;
    const ancestors = page.ancestorIds?.length ? page.ancestorIds : page.parentId ? [page.parentId] : [];
    const selectedAncestor = [...ancestors].reverse().map((id) => selectedByProviderId.get(id)).find(Boolean);
    const selectedParent = selectedAncestor ?? root;
    projected.set(page.canonicalId, selectedParent.canonicalId);
    const immediateParentId = page.parentId ?? ancestors.at(-1);
    if (immediateParentId && immediateParentId !== selectedParent.id) {
      hierarchyGaps.push({
        pageId: page.canonicalId,
        missingParentId: immediateParentId,
        selectedParentId: selectedParent.canonicalId,
        reason: excludedIds.has(immediateParentId) ? 'source-status' : 'unavailable',
      });
    }
  }

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
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const trail: string[] = [];
    let current: string | undefined = id;
    while (current && depths.get(current) === undefined) {
      trail.push(current);
      current = projected.get(current);
    }
    let depth = current ? depths.get(current) ?? 0 : 0;
    for (const candidate of trail.reverse()) {
      depth += 1;
      depths.set(candidate, depth);
    }
    return depths.get(id) ?? 0;
  };

  const pages = [...selected.values()].map<DiscoveredPage>((page) => {
    const projectedParentId = projected.get(page.canonicalId);
    return {...page, depth: depthOf(page.canonicalId), ...(projectedParentId ? {projectedParentId} : {})};
  }).sort((left, right) => left.depth - right.depth || left.canonicalId.localeCompare(right.canonicalId));

  if (pages.length !== new Set(pages.map((page) => page.canonicalId)).size) {
    throw new Error('Source inventory invariant failed: a selected page was accounted for more than once');
  }
  if (pages.some((page) => page.canonicalId !== root.canonicalId && !page.projectedParentId)) {
    throw new Error('Source inventory invariant failed: a selected page has no projected parent');
  }

  const selection: SourceSelection = {
    requestedStatus,
    effectiveStatus: discovery.effectiveStatus,
    returnedDescendants: discovery.returned,
    selectedDescendants: pages.length - 1,
    excluded: [...new Map(discovery.excluded.map((item) => [item.id, item])).values()],
    maximumDepth: Math.max(0, ...pages.map((page) => page.depth)),
    hierarchyGaps,
    notes: discovery.notes,
  };
  onProgress?.({pages: pages.length, edges: edges.length});
  return {rootId: root.canonicalId, pages, edges, warnings, selection};
}
