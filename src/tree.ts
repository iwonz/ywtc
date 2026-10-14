import type {PagePlan, YandexPageDetails} from './types.js';
import {normalizeWikiSlug} from './input.js';

export interface TreeBuildResult {
  pages: PagePlan[];
  warnings: string[];
}

function closestParent(page: YandexPageDetails, pagesById: Map<number, YandexPageDetails>, pagesBySlug: Map<string, YandexPageDetails>): number | undefined {
  const breadcrumbs = [...(page.breadcrumbs ?? [])].reverse();
  for (const breadcrumb of breadcrumbs) {
    if (breadcrumb.id !== undefined && breadcrumb.id !== page.id && pagesById.has(breadcrumb.id)) {
      return breadcrumb.id;
    }
    const candidate = pagesBySlug.get(normalizeWikiSlug(breadcrumb.slug));
    if (candidate && candidate.id !== page.id) return candidate.id;
  }

  let slug = normalizeWikiSlug(page.slug);
  while (slug.includes('/')) {
    slug = slug.slice(0, slug.lastIndexOf('/'));
    const candidate = pagesBySlug.get(slug);
    if (candidate && candidate.id !== page.id) return candidate.id;
  }
  return undefined;
}

export function buildPageTree(rootId: number, sourcePages: YandexPageDetails[]): TreeBuildResult {
  const pagesById = new Map(sourcePages.map((page) => [page.id, page]));
  const pagesBySlug = new Map(sourcePages.map((page) => [normalizeWikiSlug(page.slug), page]));
  const warnings: string[] = [];

  if (!pagesById.has(rootId)) throw new Error(`Source root page ${rootId} is missing from discovery results`);

  const parents = new Map<number, number | undefined>();
  parents.set(rootId, undefined);
  for (const page of sourcePages) {
    if (page.id === rootId) continue;
    const parent = closestParent(page, pagesById, pagesBySlug);
    if (parent === undefined) {
      parents.set(page.id, rootId);
      warnings.push(`Page ${page.slug} has no accessible parent; attached below the migration root`);
    } else {
      parents.set(page.id, parent);
    }
  }

  const depthCache = new Map<number, number>([[rootId, 0]]);
  const depthOf = (id: number, seen = new Set<number>()): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) throw new Error(`Cycle detected in Wiki hierarchy at page ${id}`);
    seen.add(id);
    const parent = parents.get(id);
    const depth = parent === undefined ? 0 : depthOf(parent, seen) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  const pages = sourcePages
    .map<PagePlan>((source) => {
      const parentSourceId = parents.get(source.id);
      return {
        source,
        ...(parentSourceId !== undefined ? {parentSourceId} : {}),
        depth: depthOf(source.id),
        destinationTitle: source.title.trim() || normalizeWikiSlug(source.slug).split('/').at(-1) || `Page ${source.id}`,
      };
    })
    .sort((left, right) => left.depth - right.depth || left.source.slug.localeCompare(right.source.slug));

  return {pages, warnings};
}
