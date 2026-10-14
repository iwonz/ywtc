import {describe, expect, it} from 'vitest';
import {parseWikiSource, resolveRelativeWikiSlug, safeFilename} from '../src/input.js';

describe('Wiki input parsing', () => {
  it('accepts slugs and configured Wiki URLs', () => {
    expect(parseWikiSource('/team/docs/', 'https://wiki.yandex.ru')).toBe('team/docs');
    expect(parseWikiSource('https://wiki.yandex.ru/team/%D0%B4%D0%BE%D0%BA', 'https://wiki.yandex.ru')).toBe('team/док');
  });

  it('rejects a different source host', () => {
    expect(() => parseWikiSource('https://example.com/team/docs', 'https://wiki.yandex.ru')).toThrow(/host/);
  });

  it('normalizes relative paths and unsafe filenames', () => {
    expect(resolveRelativeWikiSlug('team/current/page', '../other')).toBe('team/other');
    expect(safeFilename('../bad:name?.png')).toBe('bad_name_.png');
  });
});
