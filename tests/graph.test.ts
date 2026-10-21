import {describe, expect, it} from 'vitest';
import fc from 'fast-check';
import type {SourceAdapter, SourcePage} from '../src/domain.js';
import {discoverPageGraph} from '../src/graph.js';

const page = (id: string, references: string[], parentId?: string): SourcePage => ({
  provider: 'yandex-wiki', profile: 'wiki', id, canonicalId: `wiki:${id}`, title: id, locator: id,
  url: `https://wiki.example.com/${id}`, ...(parentId ? {parentId} : {}), rawContent: '', rawFormat: 'yfm',
  references: references.map((href) => ({raw: href, href, kind: 'page'})),
});

describe('page graph discovery', () => {
  it('terminates cycles, deduplicates diamonds, and projects missing parents under root', async () => {
    const pages = new Map([
      ['a', page('a', ['/b', '/c'])],
      ['b', page('b', ['/c', '/a'], 'outside')],
      ['c', page('c', ['https://external.example/x'], 'b')],
    ]);
    const adapter = {
      resolveReference: async (_from: SourcePage, reference: {href?: string}) => pages.get(reference.href?.slice(1) ?? ''),
      getDescendants: async () => [],
    } as unknown as SourceAdapter;
    const graph = await discoverPageGraph({adapter, root: pages.get('a')!, scope: 'linked'});
    expect(graph.pages.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(graph.edges.some((edge) => edge.status === 'cycle' && edge.to === 'wiki:a')).toBe(true);
    expect(graph.edges.some((edge) => edge.status === 'external')).toBe(true);
    expect(graph.pages.find((item) => item.id === 'b')?.projectedParentId).toBe('wiki:a');
    expect(graph.pages.find((item) => item.id === 'c')?.projectedParentId).toBe('wiki:b');
  });

  it('reuses linked pages when a reference already exposes immutable identity', async () => {
    const root = page('root', []);
    root.references = [{raw: '/child', href: '/child', pageId: 'child', kind: 'page'}];
    const child = page('child', []);
    let resolutions = 0;
    const adapter = {
      resolveReference: async () => { resolutions += 1; return child; },
      getDescendants: async () => [],
    } as unknown as SourceAdapter;
    const graph = await discoverPageGraph({
      adapter,
      root,
      scope: 'linked',
      checkpoint: {loadPage: async (id) => id === 'child' ? child : undefined, savePage: async () => undefined},
    });
    expect(resolutions).toBe(0);
    expect(graph.pages.map((item) => item.id)).toEqual(['root', 'child']);
  });

  it('keeps page and subtree selection distinct', async () => {
    const root = page('root', ['/linked']);
    const child = {...page('child', [], 'root'), locator: 'root/child', ancestorIds: ['root']};
    const adapter = {getDescendants: async () => [child]} as unknown as SourceAdapter;
    await expect(discoverPageGraph({adapter, root, scope: 'page'})).resolves.toMatchObject({pages: [{id: 'root'}]});
    await expect(discoverPageGraph({adapter, root, scope: 'subtree'})).resolves.toMatchObject({pages: [{id: 'root'}, {id: 'child'}]});
  });

  it('deduplicates every reachable page for generated cyclic graphs', async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({min: 1, max: 80}),
      async (size) => {
        const pages = new Map(Array.from({length: size}, (_, index) => {
          const id = String(index);
          const next = String((index + 1) % size);
          return [id, page(id, [`/${next}`, `/${next}`])] as const;
        }));
        const adapter = {
          resolveReference: async (_from: SourcePage, reference: {href?: string}) => pages.get(reference.href?.slice(1) ?? ''),
          getDescendants: async () => [],
        } as unknown as SourceAdapter;
        const graph = await discoverPageGraph({adapter, root: pages.get('0')!, scope: 'linked'});
        expect(new Set(graph.pages.map((item) => item.canonicalId)).size).toBe(size);
      },
    ), {numRuns: 20});
  });

  it('processes a 10,000-page link chain exactly once per page', async () => {
    const size = 10_000;
    let resolutions = 0;
    const adapter = {
      resolveReference: async (_from: SourcePage, reference: {href?: string}) => {
        resolutions += 1;
        const id = reference.href?.slice(1) ?? '';
        const value = Number(id);
        return value < size ? page(id, value + 1 < size ? [`/${value + 1}`] : []) : undefined;
      },
      getDescendants: async () => [],
    } as unknown as SourceAdapter;
    const graph = await discoverPageGraph({adapter, root: page('0', ['/1']), scope: 'linked'});
    expect(graph.pages).toHaveLength(size);
    expect(resolutions).toBe(size - 1);
  }, 20_000);

  it('breaks malformed parent cycles below the selected root', async () => {
    const root = page('root', ['/a']);
    const a = page('a', ['/b'], 'b');
    const b = page('b', [], 'a');
    const pages = new Map([['a', a], ['b', b]]);
    const adapter = {
      resolveReference: async (_from: SourcePage, reference: {href?: string}) => pages.get(reference.href?.slice(1) ?? ''),
      getDescendants: async () => [],
    } as unknown as SourceAdapter;
    const graph = await discoverPageGraph({adapter, root, scope: 'linked'});
    expect(graph.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Hierarchy cycle')]));
    expect(graph.pages.find((item) => item.id === 'a')?.projectedParentId).toBe(root.canonicalId);
    expect(graph.pages.map((item) => item.depth)).toEqual([0, 1, 2]);
  });

  it('uses the nearest selected ancestor and records a status-filtered hierarchy gap', async () => {
    const root = page('root', []);
    const leaf = {
      ...page('leaf', [], 'obsolete-parent'),
      locator: 'root/obsolete-parent/leaf',
      ancestorIds: ['root', 'obsolete-parent'],
    };
    const adapter = {
      supportsSourceStatus: () => true,
      getDescendants: async () => ({
        pages: [leaf],
        returned: 2,
        excluded: [{id: 'obsolete-parent', locator: 'root/obsolete-parent', reason: 'source-status' as const, status: 'obsolete'}],
        effectiveStatus: 'current' as const,
        notes: [],
      }),
    } as unknown as SourceAdapter;
    const graph = await discoverPageGraph({adapter, root, scope: 'subtree', sourceStatus: 'current'});
    expect(graph.pages.find((item) => item.id === 'leaf')).toMatchObject({projectedParentId: root.canonicalId, depth: 1});
    expect(graph.selection).toMatchObject({
      returnedDescendants: 2,
      selectedDescendants: 1,
      maximumDepth: 1,
      excluded: [{id: 'obsolete-parent', reason: 'source-status'}],
      hierarchyGaps: [{pageId: 'wiki:leaf', missingParentId: 'obsolete-parent', selectedParentId: root.canonicalId, reason: 'source-status'}],
    });
  });

  it('rejects an incomplete subtree inventory before returning a graph', async () => {
    const root = page('root', []);
    const outside = {...page('outside', [], 'elsewhere'), locator: 'another-tree/outside', ancestorIds: ['elsewhere']};
    const adapter = {
      supportsSourceStatus: () => true,
      getDescendants: async () => ({pages: [outside], returned: 1, excluded: [], effectiveStatus: 'all' as const, notes: []}),
    } as unknown as SourceAdapter;
    await expect(discoverPageGraph({adapter, root, scope: 'subtree'})).rejects.toThrow(/outside subtree/);
  });
});
