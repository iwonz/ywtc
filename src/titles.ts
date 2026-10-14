import {createHash} from 'node:crypto';
import type {PagePlan} from './types.js';

function trimTitle(value: string): string {
  const title = value.trim() || 'Untitled';
  return title.length <= 255 ? title : title.slice(0, 255).trimEnd();
}

function slugSuffix(slug: string): string {
  const leaf = slug.split('/').filter(Boolean).at(-1) ?? 'page';
  const readable = leaf.replace(/[-_]+/g, ' ').replace(/[^\p{L}\p{N} .()]+/gu, '').trim();
  return readable || createHash('sha1').update(slug).digest('hex').slice(0, 8);
}

function suffixedTitle(base: string, suffix: string, sequence?: number): string {
  const ending = ` — ${suffix}${sequence ? `-${sequence}` : ''}`;
  return `${base.slice(0, Math.max(1, 255 - ending.length)).trimEnd()}${ending}`;
}

export interface TitleAssignmentResult {
  pages: PagePlan[];
  renames: Array<{sourceId: number; sourceTitle: string; destinationTitle: string}>;
}

export async function assignDestinationTitles(
  pages: PagePlan[],
  isTaken: (title: string, page: PagePlan) => Promise<boolean>,
): Promise<TitleAssignmentResult> {
  const used = new Set<string>();
  const renames: TitleAssignmentResult['renames'] = [];

  for (const page of pages) {
    const original = trimTitle(page.destinationTitle);
    let candidate = original;
    let sequence = 0;
    while (used.has(candidate.toLocaleLowerCase()) || await isTaken(candidate, page)) {
      sequence += 1;
      candidate = suffixedTitle(original, slugSuffix(page.source.slug), sequence === 1 ? undefined : sequence);
    }
    page.destinationTitle = candidate;
    used.add(candidate.toLocaleLowerCase());
    if (candidate !== original) {
      renames.push({sourceId: page.source.id, sourceTitle: original, destinationTitle: candidate});
    }
  }

  return {pages, renames};
}
