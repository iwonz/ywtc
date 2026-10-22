import {LinkifyIt} from 'linkify-it';

export const MAX_LINKIFY_CHUNK_CHARS = 16 * 1024;

export interface SafeLinkMatch {
  schema: string;
  index: number;
  lastIndex: number;
  raw: string;
  text: string;
  url: string;
}

const linkifier = new LinkifyIt();

function isWhitespace(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 9 && code <= 13)
    || code === 32
    || code === 133
    || code === 160
    || code === 5760
    || (code >= 8192 && code <= 8202)
    || code === 8232
    || code === 8233
    || code === 8239
    || code === 8287
    || code === 12288
    || code === 65279;
}

/**
 * Run regex-based linkification only on bounded, whitespace-aligned regions.
 * Oversized lexical tokens remain untouched text and cannot monopolize the
 * event loop inside a third-party matcher.
 */
export function safeLinkifyMatches(value: string, maximumChunkChars = MAX_LINKIFY_CHUNK_CHARS): SafeLinkMatch[] {
  if (!value || maximumChunkChars < 1) return [];
  const result: SafeLinkMatch[] = [];
  let chunkStart = 0;
  let tokenStart = 0;

  const matchChunk = (end: number): void => {
    if (end <= chunkStart) return;
    for (const match of linkifier.match(value.slice(chunkStart, end)) ?? []) {
      result.push({...match, index: match.index + chunkStart, lastIndex: match.lastIndex + chunkStart});
    }
  };

  for (let index = 0; index <= value.length; index += 1) {
    if (index < value.length && !isWhitespace(value[index]!)) continue;
    const tokenLength = index - tokenStart;
    if (tokenLength > maximumChunkChars) {
      matchChunk(tokenStart);
      chunkStart = index;
    } else if (index - chunkStart > maximumChunkChars && tokenStart > chunkStart) {
      matchChunk(tokenStart);
      chunkStart = tokenStart;
    }
    if (index < value.length && chunkStart === index) chunkStart = index + 1;
    tokenStart = index + 1;
  }
  matchChunk(value.length);
  return result;
}
