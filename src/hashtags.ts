import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {CommentInventory, NormalizedDocument, NormalizedNode, RawContentFormat, RenderedDocument, SourcePage} from './domain.js';
import {type HashtagProcessingPolicy, type HashtagRecord, hashtagPresentation, validHashtag} from './hashtag-decisions.js';

export interface ScannedHashtag {tag: string; marker: string; source: string}
const character = /[\p{L}\p{N}\p{M}_-]/u;
const boundary = /[\s\p{Ps}\p{Pi}"']/u;
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const escapeMarkdown = (value: string) => value.replace(/[!-/:-@\x5b-\x60{-~]/g, '\\$&');

function delimiterPairs(source: string): Map<number, number> {
  const result = new Map<number, number>(), brackets: number[] = [], parentheses: number[] = [];
  for (let index = 0; index < source.length; index++) {
    const c = source[index];
    if (c === '\\') {index++;continue;}
    if (c === '[') brackets.push(index);
    else if (c === '(') parentheses.push(index);
    else if (c === ']' && brackets.length) result.set(brackets.pop()!, index);
    else if (c === ')' && parentheses.length) result.set(parentheses.pop()!, index);
  }
  return result;
}

function textRanges(source: string): Array<{start: number; end: number; tag: string}> {
  const ranges: Array<{start: number; end: number; tag: string}> = [];
  let index = 0, lineStart = 0, fence = '', width = 0, ticks = 0, diagram = false, htmlBoundary = -1, tokenUrl = false;
  const lower = source.toLowerCase(), pairs = delimiterPairs(source);
  while (index < source.length) {
    const c = source[index]!;
    if (c === '\n') {lineStart = ++index;tokenUrl = false;continue;}
    if (/\s/u.test(c)) tokenUrl = false;
    if (source.startsWith('://', index) || source.startsWith('data:', index) || source.startsWith('mailto:', index) || source.startsWith('www.', index)) tokenUrl = true;
    if (c === '\\') {index += 2;continue;}
    const leading = index - lineStart <= 3 && /^[ \t]*$/.test(source.slice(lineStart, index));
    if ((c === '`' || c === '~') && (leading || (!width && c === '`'))) {
      let end = index + 1;while (source[end] === c) end++;
      const count = end - index;
      if (leading && count >= 3 && !ticks) {if (!width) {width = count;fence = c;} else if (c === fence && count >= width) width = 0;}
      else if (!width && c === '`') {if (!ticks) ticks = count;else if (ticks === count) ticks = 0;}
      index = end;continue;
    }
    if (width || ticks) {index++;continue;}
    if (index === lineStart && (source.startsWith('    ', index) || c === '\t')) {const end = source.indexOf('\n', index);index = end < 0 ? source.length : end;continue;}
    if (source.startsWith('{%', index)) {
      const end = source.indexOf('%}', index + 2);
      if (end < 0) break;
      const directive = source.slice(index, Math.min(end + 2, index + 128));
      if (/^\{%\s*(diagram|mermaid|d2|plantuml)\b/i.test(directive)) diagram = true;
      if (/^\{%\s*end(diagram|mermaid|d2|plantuml)\b/i.test(directive)) diagram = false;
      index = end + 2;continue;
    }
    if (diagram) {index++;continue;}
    if (c === '<') {
      if (!/^<\/?[a-z][\w:.-]*(?=[\s/>])/i.test(source.slice(index, index + 128))) {
        if (/^<(?:https?:\/\/|mailto:)/i.test(source.slice(index, index + 16))) {const end = source.indexOf('>', index + 1);if (end >= 0) {index = end + 1;continue;}}
        index++;continue;
      }
      let end = index + 1, quote = '';
      while (end < source.length) {const value = source[end]!;if (quote) {if (value === quote) quote = '';} else if (value === '"' || value === "'") quote = value;else if (value === '>') break;end++;}
      if (end === source.length) break;
      const tag = /^<\s*(code|pre|script|style|a)\b/i.exec(source.slice(index, Math.min(end + 1, index + 100)));
      if (tag) {
        const close = lower.indexOf(`</${tag[1]!.toLowerCase()}`, end + 1), closeEnd = close < 0 ? -1 : source.indexOf('>', close);
        if (closeEnd < 0) break;
        if (tag[1]!.toLowerCase() === 'a') {
          const raw = source.slice(index, closeEnd + 1), label = load(raw, null, false).text();
          if (validHashtag(label)) ranges.push({start: index, end: closeEnd + 1, tag: label});
        }
        index = closeEnd + 1;continue;
      }
      index = end + 1;htmlBoundary = index;continue;
    }
    if (c === '[' || (c === '!' && source[index + 1] === '[')) {
      const start = index, image = c === '!', labelStart = index + (image ? 2 : 1);
      const end = pairs.get(start + (image ? 1 : 0));
      if (end === undefined) {index++;continue;}
      if (source[end + 1] === '(') {
        const stop = pairs.get(end + 1);
        if (stop !== undefined) {const tag = source.slice(labelStart, end).trim();if (!image && validHashtag(tag)) ranges.push({start, end: stop + 1, tag});index = stop + 1;continue;}
      }
      // Reference-style and wiki links are not scanned as plain mixed labels.
      if (source[end + 1] === '[') {const stop = pairs.get(end + 1);if (stop !== undefined) {const tag = source.slice(labelStart, end).trim();if (!image && validHashtag(tag)) ranges.push({start, end: stop + 1, tag});index = stop + 1;continue;}}
      if (leading && source[end + 1] === ':') {const stop = source.indexOf('\n', end + 2);index = stop < 0 ? source.length : stop;continue;}
      if (source[start + 1] === '[') {index = end + 1;continue;}
    }
    const decoration = c === '#' && /(?:^|[\s\p{Ps}\p{Pi}])(?:\*\*?|__?|~~)$/u.test(source.slice(Math.max(0, index - 3), index));
    if (c !== '#' || tokenUrl || (index > 0 && index !== htmlBoundary && !decoration && !boundary.test(source[index - 1]!)) || source[index - 1] === '{' || source[index + 1] === '#') {index++;continue;}
    let end = index + 1;
    while (end < source.length) {const point = String.fromCodePoint(source.codePointAt(end)!);if (!character.test(point)) break;end += point.length;}
    if (decoration && source[index - 1] === '_') {let trailing = source[index - 2] === '_' ? 2 : 1;while (trailing-- > 0 && source[end - 1] === '_') end--;}
    const tag = source.slice(index, end);
    if (validHashtag(tag)) ranges.push({start: index, end, tag});
    index = Math.max(index + 1, end);
  }
  return ranges;
}

export function scanHashtags(source: string, format: RawContentFormat): {content: string; hashtags: ScannedHashtag[]} {
  let namespace = createHash('sha256').update(source).digest('hex').slice(0, 16).toUpperCase();
  while (source.includes(`YWTCHASHTAG${namespace}`)) namespace += 'X';
  const hashtags: ScannedHashtag[] = [];
  const add = (tag: string, raw: string) => {const marker = `YWTCHASHTAG${namespace}X${hashtags.length.toString(36).toUpperCase()}TOKEN`;hashtags.push({tag, source: raw, marker});return marker;};
  const mask = (value: string) => {let cursor = 0;const chunks: string[] = [];for (const range of textRanges(value)) {chunks.push(value.slice(cursor, range.start), add(range.tag, value.slice(range.start, range.end)));cursor = range.end;}chunks.push(value.slice(cursor));return chunks.join('');};
  if (format === 'yfm') return {content: mask(source), hashtags};
  const $ = load(`<main data-ywtc-hashtags>${source}</main>`, {xmlMode: true}, false);
  const elements = $('main[data-ywtc-hashtags]').contents().toArray();
  const walk = (element: typeof elements[number]): void => {
    if (element.type === 'text') {element.data = mask(element.data);return;}
    if (!('children' in element)) return;
    const item = $(element);
    if (item.is('code,pre,script,style,ac\\:parameter,ac\\:plain-text-body,ywtc-mention,.ywtc-diagram,.ywtc-grid,.ywtc-expand > summary')) return;
    if (item.is('a,ac\\:link')) {
      if (item.find('ri\\:user').length) return;
      const label = item.find('ac\\:link-body,ac\\:plain-text-link-body').first().text() || item.text();
      if (validHashtag(label)) item.replaceWith(add(label, $.html(element)));
      return;
    }
    for (const child of [...element.children]) walk(child);
  };
  for (const element of elements) walk(element);
  return {content: $('main[data-ywtc-hashtags]').html() ?? '', hashtags};
}

function effectiveFingerprint(policy: HashtagProcessingPolicy, tags: string[]): string {
  if (policy.mode === 'off') return '';
  const values = [...new Set(tags)].sort().flatMap(tag => {const value = hashtagPresentation(tag, policy);return value.outcome === 'preserved' ? [] : [[tag, value.label, value.url ?? '']];});
  return values.length ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : '';
}
export function hashtagPolicyFingerprint(policy: HashtagProcessingPolicy, source: string, format: RawContentFormat): string {
  return policy.mode === 'off' ? '' : effectiveFingerprint(policy, scanHashtags(source, format).hashtags.map(item => item.tag));
}

export function pageHashtagRecords(page: SourcePage, comments: CommentInventory | undefined, policy: HashtagProcessingPolicy): {records: HashtagRecord[]; pageFingerprint: string; commentFingerprint: string} {
  const records: HashtagRecord[] = [], hashes: string[] = [];
  const add = (content: string, format: RawContentFormat, location: 'page' | 'comment', commentId?: string) => {
    const tags = scanHashtags(content, format).hashtags;
    for (const item of tags) records.push({id: `hashtag-${records.length}`, tag: item.tag, location, ...(commentId ? {commentId} : {}), ...hashtagPresentation(item.tag, policy), verification: 'pending'});
    return tags.map(item => item.tag);
  };
  const pageFingerprint = effectiveFingerprint(policy, add(page.rawContent, page.rawFormat, 'page'));
  const stack = (comments?.threads ?? []).map(thread => thread.root);
  while (stack.length) {
    const entry = stack.pop()!, format = entry.bodyFormat ?? page.rawFormat;
    const content = `${entry.inlineContext ?? ''}\n${entry.body}`;
    const fingerprint = effectiveFingerprint(policy, add(content, format, 'comment', entry.id));if (fingerprint) hashes.push(`${entry.id}:${fingerprint}`);
    stack.push(...entry.replies);
  }
  return {records, pageFingerprint, commentFingerprint: hashes.sort().join('|')};
}

export function protectChangedHashtags(source: string, format: RawContentFormat, policy: HashtagProcessingPolicy, replacements: Map<string, string>, target: 'html' | 'markdown', allowed?: ReadonlySet<string>): string {
  if (policy.mode === 'off') return source;
  const scanned = scanHashtags(source, format), restore = new Map<string, string>();
  for (const item of scanned.hashtags) {
    const value = hashtagPresentation(item.tag, policy);
    if (value.outcome === 'preserved' || (allowed && !allowed.has(item.tag))) {restore.set(item.marker, item.source);continue;}
    const label = target === 'html' ? escapeHtml(value.label) : escapeMarkdown(value.label);
    replacements.set(item.marker, value.url ? target === 'html' ? `<a href="${escapeHtml(value.url)}">${label}</a>` : `[${label}](<${value.url}>)` : label);
  }
  return scanned.content.replace(/YWTCHASHTAG[A-Z0-9]+TOKEN/g, marker => restore.get(marker) ?? marker);
}

export function renderSafeCommentHashtags(source: string, policy: HashtagProcessingPolicy, format: RawContentFormat | undefined, transform: (value: string) => string): string {
  const replacements = new Map<string, string>();
  const content = protectChangedHashtags(source, format ?? 'yfm', policy, replacements, 'markdown');
  return transform(content).replace(/YWTCHASHTAG[A-Z0-9]+TOKEN/g, marker => replacements.get(marker) ?? marker);
}

export async function renderWithHashtags(document: NormalizedDocument, policy: HashtagProcessingPolicy | undefined, target: 'html' | 'markdown', render: (document: NormalizedDocument) => Promise<RenderedDocument>): Promise<RenderedDocument> {
  if (!policy || policy.mode === 'off') return render(document);
  const allowed = new Set(scanHashtags(document.raw, document.rawFormat).hashtags.filter(item => hashtagPresentation(item.tag, policy).outcome !== 'preserved').map(item => item.tag));
  if (allowed.size === 0) return render(document);
  const replacements = new Map<string, string>();
  const prepare = (value: string, format: RawContentFormat) => protectChangedHashtags(value, format, policy, replacements, target, allowed);
  const node = (value: NormalizedNode): NormalizedNode => ({...value, ...(value.type === 'html' && value.value !== undefined ? {value: prepare(value.value, 'confluence-storage')} : {}), ...(value.children ? {children: value.children.map(node)} : {})});
  const prepared = {...document, root: node(document.root), raw: prepare(document.raw, document.rawFormat), ...(document.renderSource !== undefined ? {renderSource: prepare(document.renderSource, document.rawFormat)} : {})};
  const result = await render(prepared);
  return {...result, body: result.body.replace(/YWTCHASHTAG[A-Z0-9]+TOKEN/g, marker => replacements.get(marker) ?? marker)};
}
