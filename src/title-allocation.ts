import {createHash} from 'node:crypto';
import type {SourcePage} from './domain.js';

const maximumCandidates = 10;
const maximumTitleLength = 255;

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function readableSlug(page: SourcePage): string {
  const segment = page.locator.split('/').filter(Boolean).at(-1) ?? page.id;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Retain malformed provider text and sanitize it below.
  }
  const normalized = decoded
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || page.id.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 48) || 'page';
}

function withSuffix(title: string, suffix: string): string {
  const decorated = ` [${suffix}]`;
  const available = Math.max(1, maximumTitleLength - [...decorated].length);
  return `${[...title].slice(0, available).join('').trimEnd()}${decorated}`;
}

function fitTitle(title: string): string {
  return [...title].slice(0, maximumTitleLength).join('').trimEnd();
}

export function destinationTitleCandidates(page: SourcePage, preferredTitle?: string): string[] {
  const slug = readableSlug(page);
  const hash = shortHash(page.canonicalId);
  const candidates = [
    preferredTitle ? fitTitle(preferredTitle.trim()) : undefined,
    fitTitle(page.title.trim()),
    withSuffix(page.title.trim(), slug),
    withSuffix(page.title.trim(), `${slug}-${hash}`),
    ...Array.from({length: maximumCandidates}, (_, index) => withSuffix(page.title.trim(), `${slug}-${hash}-${index + 2}`)),
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))].slice(0, maximumCandidates);
}
