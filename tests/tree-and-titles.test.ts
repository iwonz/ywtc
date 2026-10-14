import {describe, expect, it} from 'vitest';
import {assignDestinationTitles} from '../src/titles.js';
import {buildPageTree} from '../src/tree.js';
import type {YandexPageDetails} from '../src/types.js';

function page(id: number, slug: string, title: string, breadcrumbs: YandexPageDetails['breadcrumbs'] = []): YandexPageDetails {
  return {id, slug, title, page_type: 'wysiwyg', content: '', breadcrumbs};
}

describe('page hierarchy and title assignment', () => {
  it('uses breadcrumbs and falls back to the migration root', () => {
    const root = page(1, 'root', 'Root');
    const child = page(2, 'root/child', 'Child', [{id: 1, slug: 'root', title: 'Root'}]);
    const orphan = page(3, 'elsewhere/orphan', 'Orphan');
    const result = buildPageTree(1, [orphan, child, root]);

    expect(result.pages.map((item) => [item.source.id, item.parentSourceId, item.depth])).toEqual([
      [1, undefined, 0],
      [3, 1, 1],
      [2, 1, 1],
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it('adds deterministic slug suffixes for duplicate and occupied titles', async () => {
    const tree = buildPageTree(1, [
      page(1, 'root', 'Docs'),
      page(2, 'root/a', 'Same'),
      page(3, 'root/b', 'Same'),
    ]).pages;
    const result = await assignDestinationTitles(tree, async (title) => title === 'Docs');

    expect(result.pages[0]?.destinationTitle).toBe('Docs — root');
    expect(result.pages[1]?.destinationTitle).toBe('Same');
    expect(result.pages[2]?.destinationTitle).toBe('Same — b');
    expect(result.renames).toHaveLength(2);
  });
});
