import {describe, expect, it} from 'vitest';
import {MAX_LINKIFY_CHUNK_CHARS, safeLinkifyMatches} from '../src/safe-linkify.js';

describe('bounded implicit linkification', () => {
  it('preserves links, punctuation, and original offsets across bounded chunks', () => {
    const prefix = `${'ordinary '.repeat(2_000)} `;
    const value = `${prefix}https://example.com/path?a=1, then mail@example.com.`;
    const matches = safeLinkifyMatches(value);

    expect(matches.map((match) => match.url)).toEqual(['https://example.com/path?a=1', 'mailto:mail@example.com']);
    for (const match of matches) expect(value.slice(match.index, match.lastIndex)).toBe(match.raw);
  });

  it('skips an oversized token but keeps links on both sides', () => {
    const oversized = `data:image/png;base64,${'A'.repeat(MAX_LINKIFY_CHUNK_CHARS)}`;
    const value = `https://before.example ${oversized} https://after.example/path`;

    expect(safeLinkifyMatches(value).map((match) => match.url)).toEqual([
      'https://before.example',
      'https://after.example/path',
    ]);
  });
});
