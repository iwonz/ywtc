import {describe, expect, it} from 'vitest';
import type {SourcePage} from '../src/domain.js';
import {destinationTitleCandidates} from '../src/title-allocation.js';

function source(overrides: Partial<SourcePage> = {}): SourcePage {
  return {
    provider: 'yandex-wiki', profile: 'wiki', id: '42', canonicalId: 'wiki:yandex:42',
    title: 'Дизайн-система', locator: 'rnd/design/о-нас', url: 'https://wiki.example/rnd/design/o-nas',
    rawContent: 'body', rawFormat: 'yfm', references: [], ...overrides,
  };
}

describe('destination title allocation', () => {
  it('uses stable original, slug, hash, and bounded sequence candidates', () => {
    const first = destinationTitleCandidates(source());
    const second = destinationTitleCandidates(source());
    expect(first).toEqual(second);
    expect(first).toHaveLength(10);
    expect(first[0]).toBe('Дизайн-система');
    expect(first[1]).toBe('Дизайн-система [о-нас]');
    expect(first[2]).toMatch(/^Дизайн-система \[о-нас-[0-9a-f]{8}\]$/);
    expect(first.at(-1)).toMatch(/-8\]$/);
  });

  it('prefers an existing mapped title, removes duplicate candidates, and respects the title limit', () => {
    const title = 'Ю'.repeat(400);
    const candidates = destinationTitleCandidates(source({title}), 'Existing mapped title');
    expect(candidates[0]).toBe('Existing mapped title');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.every((candidate) => [...candidate].length <= 255)).toBe(true);
  });
});
