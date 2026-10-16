import transform from '@diplodoc/transform';
import {load} from 'cheerio';
import {LinkifyIt} from 'linkify-it';
import {normalizeWikiSlug, resolveRelativeWikiSlug} from './input.js';
import {hasYfmLayouts, parseYfmDocumentSegments} from './layout.js';
import type {YandexGrid} from './types.js';

export interface DestinationPageReference {
  sourceId: number;
  slug: string;
  destinationTitle: string;
}

export interface ConversionContext {
  currentSlug: string;
  spaceKey: string;
  wikiWebUrl: string;
  pagesBySlug: Map<string, DestinationPageReference>;
  attachmentsByReference: Map<string, string>;
  resourceFallbacksByReference?: Map<string, string>;
}

export interface ConversionResult {
  storage: string;
  warnings: string[];
  stats: ConversionStats;
}

export interface ConversionStats {
  internalPageLinks: number;
  externalLinks: number;
  attachmentLinks: number;
  anchorLinks: number;
  attachedImages: number;
  externalImages: number;
  tables: number;
  codeBlocks: number;
}

export function emptyConversionStats(): ConversionStats {
  return {
    internalPageLinks: 0,
    externalLinks: 0,
    attachmentLinks: 0,
    anchorLinks: 0,
    attachedImages: 0,
    externalImages: 0,
    tables: 0,
    codeBlocks: 0,
  };
}

export function mergeConversionStats(target: ConversionStats, ...sources: ConversionStats[]): ConversionStats {
  for (const source of sources) {
    for (const key of Object.keys(target) as Array<keyof ConversionStats>) target[key] += source[key];
  }
  return target;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: unknown): string {
  return escapeXml(value).replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function cdata(value: unknown): string {
  return String(value ?? '').replaceAll(']]>', ']]]]><![CDATA[>');
}

const legacyTextColors: Record<string, string> = {
  gray: '#6b778c',
  grey: '#6b778c',
  red: '#de350b',
  green: '#00875a',
  blue: '#0052cc',
  orange: '#ff8b00',
  yellow: '#ffab00',
  purple: '#6554c0',
  black: '#172b4d',
  white: '#ffffff',
};
const linkifier = new LinkifyIt();

function closingParenthesis(value: string, openingIndex: number): number | undefined {
  let depth = 0;
  for (let index = openingIndex; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1;
      continue;
    }
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function renderAutolinkText(value: string, context: ConversionContext, stats: ConversionStats): string {
  const matches = linkifier.match(value);
  if (!matches) return escapeXml(value);

  let cursor = 0;
  let output = '';
  for (const match of matches) {
    output += escapeXml(value.slice(cursor, match.index));
    const target = resolveLink(match.url, context);
    recordLink(target, stats);
    output += storageLink(target, escapeXml(match.text), match.text);
    cursor = match.lastIndex;
  }
  return output + escapeXml(value.slice(cursor));
}

function renderLegacyInlineText(
  value: string,
  context: ConversionContext,
  stats: ConversionStats,
  autolink: boolean,
): string {
  const marker = /\{(gray|grey|red|green|blue|orange|yellow|purple|black|white)\}\(/giu;
  let cursor = 0;
  let output = '';
  let match = marker.exec(value);
  const renderPlain = (text: string) => autolink ? renderAutolinkText(text, context, stats) : escapeXml(text);

  while (match !== null) {
    const openingIndex = marker.lastIndex - 1;
    const closingIndex = closingParenthesis(value, openingIndex);
    if (closingIndex === undefined) break;
    output += renderPlain(value.slice(cursor, match.index));
    const color = legacyTextColors[match[1]!.toLocaleLowerCase()]!;
    output += `<span style="color: ${color};">${renderPlain(value.slice(openingIndex + 1, closingIndex))}</span>`;
    cursor = closingIndex + 1;
    marker.lastIndex = cursor;
    match = marker.exec(value);
  }

  return output + renderPlain(value.slice(cursor));
}

function normalizeReference(value: string): string {
  let normalized = value.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original malformed reference so it can still be reported.
  }
  return normalized.replace(/^\.\//, '').replace(/^\/+/, '').toLocaleLowerCase();
}

function attachmentFor(reference: string, context: ConversionContext): string | undefined {
  const withoutFragment = reference.split(/[?#]/, 1)[0] ?? reference;
  const direct = context.attachmentsByReference.get(normalizeReference(withoutFragment));
  if (direct) return direct;
  const basename = withoutFragment.replace(/\\/g, '/').split('/').at(-1);
  return basename ? context.attachmentsByReference.get(normalizeReference(basename)) : undefined;
}

function resourceFallbackFor(reference: string, context: ConversionContext): string | undefined {
  const withoutFragment = reference.split(/[?#]/, 1)[0] ?? reference;
  const direct = context.resourceFallbacksByReference?.get(normalizeReference(withoutFragment));
  if (direct) return direct;
  const basename = withoutFragment.replace(/\\/g, '/').split('/').at(-1);
  return basename ? context.resourceFallbacksByReference?.get(normalizeReference(basename)) : undefined;
}

type LinkTarget =
  | {type: 'page'; page: DestinationPageReference; anchor?: string}
  | {type: 'attachment'; filename: string}
  | {type: 'anchor'; anchor: string}
  | {type: 'external'; href: string};

function resolveLink(href: string, context: ConversionContext): LinkTarget {
  const attached = attachmentFor(href, context);
  if (attached) return {type: 'attachment', filename: attached};
  const fallback = resourceFallbackFor(href, context);
  if (fallback) return {type: 'external', href: fallback};
  if (href.startsWith('#')) return {type: 'anchor', anchor: href.slice(1)};
  if (/^(?:mailto|tel):/i.test(href)) return {type: 'external', href};

  let linkPath = href;
  let anchor: string | undefined;
  let isWikiLink = false;
  try {
    const absolute = new URL(href);
    const wiki = new URL(context.wikiWebUrl);
    if (absolute.origin !== wiki.origin) {
      return /^https?:$/i.test(absolute.protocol)
        ? {type: 'external', href: absolute.toString()}
        : {type: 'external', href: '#'};
    }
    isWikiLink = true;
    linkPath = absolute.pathname;
    anchor = absolute.hash.slice(1) || undefined;
  } catch {
    const hashIndex = linkPath.indexOf('#');
    if (hashIndex >= 0) {
      anchor = linkPath.slice(hashIndex + 1) || undefined;
      linkPath = linkPath.slice(0, hashIndex);
    }
    isWikiLink = linkPath.startsWith('/') || !/^[a-z][a-z\d+.-]*:/i.test(linkPath);
  }

  if (isWikiLink && linkPath) {
    const candidates = linkPath.startsWith('/')
      ? [normalizeWikiSlug(linkPath)]
      : [
          normalizeWikiSlug(linkPath),
          resolveRelativeWikiSlug(context.currentSlug, linkPath),
          normalizeWikiSlug(`${context.currentSlug}/${linkPath}`),
        ];
    for (const candidate of candidates) {
      const page = context.pagesBySlug.get(candidate.toLocaleLowerCase());
      if (page) return {type: 'page', page, ...(anchor ? {anchor} : {})};
    }
    const slug = candidates[1] ?? candidates[0] ?? linkPath;
    const original = new URL(`${normalizeWikiSlug(slug)}${anchor ? `#${anchor}` : ''}`, `${context.wikiWebUrl}/`);
    return {type: 'external', href: original.toString()};
  }

  return {type: 'external', href: /^https?:\/\//i.test(href) ? href : '#'};
}

function anchorMacro(anchor: string): string {
  return `<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">${escapeXml(anchor)}</ac:parameter></ac:structured-macro>`;
}

function storageLink(target: LinkTarget, body: string, plainText: string): string {
  if (target.type === 'page') {
    const anchor = target.anchor ? ` ac:anchor="${escapeAttribute(target.anchor)}"` : '';
    return `<ac:link${anchor}><ri:page ri:content-title="${escapeAttribute(target.page.destinationTitle)}"/><ac:link-body>${body || escapeXml(plainText)}</ac:link-body></ac:link>`;
  }
  if (target.type === 'attachment') {
    return `<ac:link><ri:attachment ri:filename="${escapeAttribute(target.filename)}"/><ac:plain-text-link-body><![CDATA[${cdata(plainText || target.filename)}]]></ac:plain-text-link-body></ac:link>`;
  }
  if (target.type === 'anchor') {
    return `<ac:link ac:anchor="${escapeAttribute(target.anchor)}"><ac:link-body>${body || escapeXml(plainText)}</ac:link-body></ac:link>`;
  }
  return `<a href="${escapeAttribute(target.href)}">${body || escapeXml(plainText)}</a>`;
}

function recordLink(target: LinkTarget, stats: ConversionStats): void {
  if (target.type === 'page') stats.internalPageLinks += 1;
  else if (target.type === 'attachment') stats.attachmentLinks += 1;
  else if (target.type === 'anchor') stats.anchorLinks += 1;
  else stats.externalLinks += 1;
}

function renderHtmlToStorage(
  html: string,
  context: ConversionContext,
  warnings: Set<string>,
  stats: ConversionStats,
): string {
  const $ = load(html, null, false);
  let taskId = 1;

  const isInsideLinkOrCode = (node: any): boolean => {
    let parent = node.parent;
    while (parent) {
      if (['a', 'code', 'pre'].includes(String(parent.name).toLocaleLowerCase())) return true;
      parent = parent.parent;
    }
    return false;
  };

  const renderChildren = (node: any): string => (node.children ?? []).map((child: any) => renderNode(child)).join('');

  const renderNode = (node: any): string => {
    if (node.type === 'text') {
      return renderLegacyInlineText(String(node.data ?? ''), context, stats, !isInsideLinkOrCode(node));
    }
    if (node.type !== 'tag') return '';

    const name = String(node.name).toLowerCase();
    const element = $(node);
    const classes = new Set(String(element.attr('class') ?? '').split(/\s+/).filter(Boolean));

    if (['script', 'style', 'button', 'svg'].includes(name)) return '';
    if (classes.has('yfm-anchor')) return '';

    if (classes.has('yfm-note')) {
      const rawType = element.attr('note-type')
        ?? [...classes].find((entry) => entry.startsWith('yfm-accent-'))?.replace('yfm-accent-', '')
        ?? 'info';
      const macro = rawType === 'alert' ? 'warning' : ['info', 'tip', 'warning'].includes(rawType) ? rawType : 'info';
      const title = element.children('.yfm-note-title').first().text().trim();
      const contentNode = element.children('.yfm-note-content').first().get(0);
      const titleParameter = title ? `<ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>` : '';
      return `<ac:structured-macro ac:name="${macro}" ac:schema-version="1">${titleParameter}<ac:rich-text-body>${contentNode ? renderChildren(contentNode) : renderChildren(node)}</ac:rich-text-body></ac:structured-macro>`;
    }

    if (name === 'details' || classes.has('yfm-cut')) {
      const title = element.children('summary').first().text().trim() || 'Details';
      const contentNode = element.children('.yfm-cut-content').first().get(0);
      const content = contentNode
        ? renderChildren(contentNode)
        : (node.children ?? []).filter((child: any) => child.name !== 'summary').map((child: any) => renderNode(child)).join('');
      return `<ac:structured-macro ac:name="expand" ac:schema-version="1"><ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter><ac:rich-text-body>${content}</ac:rich-text-body></ac:structured-macro>`;
    }

    if (classes.has('yfm-tabs')) {
      warnings.add('Tabs were converted to static headed sections');
      return element.find('.yfm-tab-panel').toArray().map((panel) => {
        const title = $(panel).attr('data-title') || 'Tab';
        return `<h3>${escapeXml(title)}</h3>${renderChildren(panel)}`;
      }).join('');
    }

    if (classes.has('yfm-clipboard')) {
      const pre = element.find('pre').first().get(0);
      return pre ? renderNode(pre) : '';
    }

    if (/^h[1-6]$/.test(name)) {
      const id = element.attr('id');
      return `${id && id !== 'undefined' ? anchorMacro(id) : ''}<${name}>${renderChildren(node)}</${name}>`;
    }

    if (name === 'a') {
      const href = element.attr('href');
      if (!href) {
        const id = element.attr('id') ?? element.attr('name');
        return `${id ? anchorMacro(id) : ''}${renderChildren(node)}`;
      }
      const target = resolveLink(href, context);
      recordLink(target, stats);
      return storageLink(target, renderChildren(node), element.text());
    }

    if (name === 'img') {
      const src = element.attr('src') ?? '';
      const filename = attachmentFor(src, context);
      const attrs = [
        element.attr('alt') ? ` ac:alt="${escapeAttribute(element.attr('alt'))}"` : '',
        element.attr('width') ? ` ac:width="${escapeAttribute(element.attr('width'))}"` : '',
        element.attr('height') ? ` ac:height="${escapeAttribute(element.attr('height'))}"` : '',
      ].join('');
      if (filename) {
        stats.attachedImages += 1;
        return `<ac:image${attrs}><ri:attachment ri:filename="${escapeAttribute(filename)}"/></ac:image>`;
      }
      const fallback = resourceFallbackFor(src, context);
      if (fallback) {
        stats.externalImages += 1;
        warnings.add(`Image uses its source fallback because it was not transferred: ${src}`);
        return `<ac:image${attrs}><ri:url ri:value="${escapeAttribute(fallback)}"/></ac:image>`;
      }
      const target = resolveLink(src, context);
      const external = target.type === 'external' ? target.href : new URL(src, `${context.wikiWebUrl}/`).toString();
      stats.externalImages += 1;
      warnings.add(`Image was kept as an external reference: ${src}`);
      return `<ac:image${attrs}><ri:url ri:value="${escapeAttribute(external)}"/></ac:image>`;
    }

    if (name === 'pre') {
      stats.codeBlocks += 1;
      const code = element.find('code').first();
      const raw = code.length ? code.text() : element.text();
      const className = code.attr('class') ?? '';
      const language = className.match(/language-([\w+-]+)/)?.[1];
      const parameter = language ? `<ac:parameter ac:name="language">${escapeXml(language)}</ac:parameter>` : '';
      return `<ac:structured-macro ac:name="code" ac:schema-version="1">${parameter}<ac:plain-text-body><![CDATA[${cdata(raw)}]]></ac:plain-text-body></ac:structured-macro>`;
    }

    if (name === 'input' && element.attr('type') === 'checkbox') {
      return element.attr('checked') !== undefined ? '☑ ' : '☐ ';
    }

    if (name === 'video') {
      const src = element.attr('src') ?? '';
      warnings.add(`Video was converted to a link: ${src}`);
      return `<p><a href="${escapeAttribute(src)}">${escapeXml(src || 'Video')}</a></p>`;
    }

    if (classes.has('yfm-math') || classes.has('math')) {
      warnings.add('Math markup was converted to inline code because no standard Confluence math macro is assumed');
      return `<code>${escapeXml(element.text())}</code>`;
    }

    if (name === 'p') {
      const plainText = element.text().replaceAll('\u00a0', ' ');
      const taskLines = plainText.split(/\r?\n/).filter((line) => line.trim());
      if (taskLines.length > 0 && taskLines.every((line) => /^\s*\[[ xX]\]\s+/.test(line))) {
        const renderedLines = renderChildren(node).split(/\r?\n/).filter((line) => line.trim());
        const tasks = taskLines.map((line, index) => {
          const task = line.match(/^\s*\[([ xX])\]\s+/)!;
          const status = task[1]?.toLocaleLowerCase() === 'x' ? 'complete' : 'incomplete';
          const body = (renderedLines[index] ?? renderLegacyInlineText(line, context, stats, true)).replace(/^\s*\[[ xX]\]\s+/, '');
          return `<ac:task><ac:task-id>${taskId++}</ac:task-id><ac:task-status>${status}</ac:task-status><ac:task-body>${body}</ac:task-body></ac:task>`;
        }).join('');
        return `<ac:task-list>${tasks}</ac:task-list>`;
      }
      if (!plainText.trim() && element.find('img,video,table').length === 0) return '';
      const id = element.attr('id');
      return `${id ? anchorMacro(id) : ''}<p>${renderChildren(node)}</p>`;
    }

    if (name === 'mark') {
      return `<span style="background-color: #fff0b3;">${renderChildren(node)}</span>`;
    }
    if (name === 'kbd') return `<code>${renderChildren(node)}</code>`;
    if (name === 'ins') return `<u>${renderChildren(node)}</u>`;

    const supported = new Set(['strong', 'em', 'u', 's', 'del', 'code', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'dl', 'dt', 'dd', 'sup', 'sub']);
    if (supported.has(name)) {
      if (name === 'table') stats.tables += 1;
      const attributes = name === 'th' || name === 'td'
        ? ['rowspan', 'colspan'].map((attribute) => element.attr(attribute) ? ` ${attribute}="${escapeAttribute(element.attr(attribute))}"` : '').join('')
        : name === 'ol' && /^\d+$/.test(element.attr('start') ?? '')
          ? ` start="${escapeAttribute(element.attr('start'))}"`
          : '';
      return `<${name}${attributes}>${renderChildren(node)}</${name}>`;
    }
    if (name === 'br' || name === 'hr') return `<${name}/>`;
    return renderChildren(node);
  };

  return $.root().contents().toArray().map((node) => renderNode(node)).join('');
}

function convertYfmFragmentToStorage(
  content: string,
  context: ConversionContext,
  warnings: Set<string>,
  stats: ConversionStats,
): string {
  try {
    const output = transform(content || '', {
      allowHTML: true,
      needToSanitizeHtml: true,
      supportGithubAnchors: true,
      lang: 'ru',
      // markdown-it 13 linkify has known quadratic paths. Bare URLs are linked
      // later from parsed text nodes with current linkify-it instead.
      linkify: false,
    });
    for (const warning of [...(output.logs.warn ?? []), ...(output.logs.error ?? [])]) warnings.add(warning);
    return renderHtmlToStorage(output.result.html, context, warnings, stats);
  } catch (error) {
    warnings.add(`YFM transformation failed; original source was preserved: ${error instanceof Error ? error.message : String(error)}`);
    return `<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="title">Original YFM</ac:parameter><ac:plain-text-body><![CDATA[${cdata(content)}]]></ac:plain-text-body></ac:structured-macro>`;
  }
}

function confluenceLayoutType(cellCount: number): 'single' | 'two_equal' | 'three_equal' {
  if (cellCount <= 1) return 'single';
  if (cellCount === 2) return 'two_equal';
  return 'three_equal';
}

export function convertYfmToStorage(content: string, context: ConversionContext): ConversionResult {
  const warnings = new Set<string>();
  const stats = emptyConversionStats();
  const segments = parseYfmDocumentSegments(content);
  if (!hasYfmLayouts(segments)) {
    const storage = convertYfmFragmentToStorage(content, context, warnings, stats);
    return {storage: storage || '<p></p>', warnings: [...warnings], stats};
  }

  const sections: string[] = [];
  for (const segment of segments) {
    if (segment.type === 'content') {
      if (!segment.raw.trim()) continue;
      const body = convertYfmFragmentToStorage(segment.raw, context, warnings, stats);
      if (!body.trim()) continue;
      sections.push(`<ac:layout-section ac:type="single"><ac:layout-cell>${body}</ac:layout-cell></ac:layout-section>`);
      continue;
    }
    if (segment.cells.length > 3) {
      warnings.add(`YFM layout with ${segment.cells.length} columns was split into Confluence rows of at most three columns`);
    }
    for (let offset = 0; offset < segment.cells.length; offset += 3) {
      const cells = segment.cells.slice(offset, offset + 3);
      const type = confluenceLayoutType(cells.length);
      const body = cells.map((cell) => (
        `<ac:layout-cell>${convertYfmFragmentToStorage(cell, context, warnings, stats) || '<p></p>'}</ac:layout-cell>`
      )).join('');
      sections.push(`<ac:layout-section ac:type="${type}">${body}</ac:layout-section>`);
    }
  }
  return {
    storage: `<ac:layout>${sections.join('')}</ac:layout>`,
    warnings: [...warnings],
    stats,
  };
}

/**
 * Render source YFM for the local report comparator. The Diplodoc sanitizer is
 * deliberately enabled; the report adds a second sanitization layer and loads
 * this markup inside an iframe without script privileges.
 */
export function renderYfmPreview(content: string): string {
  try {
    const output = transform(content || '', {
      allowHTML: true,
      needToSanitizeHtml: true,
      supportGithubAnchors: true,
      lang: 'ru',
      linkify: false,
    });
    return output.result.html || '<p></p>';
  } catch {
    return `<pre><code>${escapeXml(content)}</code></pre>`;
  }
}

function gridCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(gridCellText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const preferred = object.display_name ?? object.display ?? object.key ?? object.username ?? object.name;
    if (preferred !== undefined) return gridCellText(preferred);
    return JSON.stringify(value);
  }
  return String(value);
}

export function convertGridToStorage(grid: YandexGrid, context: ConversionContext): ConversionResult {
  const warnings = new Set<string>([`Dynamic table "${grid.title}" was converted to a static table`]);
  const stats = emptyConversionStats();
  stats.tables = 1;
  const headers = grid.structure.columns.map((column) => `<th>${escapeXml(column.title)}</th>`).join('');
  const rows = grid.rows.map((row) => {
    const cells = grid.structure.columns.map((column, index) => {
      const value = gridCellText(row.row[index]);
      if (column.format === 'yfm' && value) {
        const converted = convertYfmToStorage(value, context);
        converted.warnings.forEach((warning) => {
          warnings.add(warning);
        });
        mergeConversionStats(stats, converted.stats);
        return `<td>${converted.storage}</td>`;
      }
      return `<td>${escapeXml(value)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return {
    storage: `<h2>${escapeXml(grid.title)}</h2><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`,
    warnings: [...warnings],
    stats,
  };
}

export function createAttachmentReferenceMap(entries: Array<{sourceName: string; destinationName: string; downloadUrl?: string}>): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const keys = [entry.sourceName, `.files/${entry.sourceName}`, `_files/${entry.sourceName}`, entry.downloadUrl]
      .filter((value): value is string => Boolean(value));
    for (const key of keys) {
      map.set(normalizeReference(key), entry.destinationName);
      const basename = key.replace(/\\/g, '/').split('/').at(-1);
      if (basename) map.set(normalizeReference(basename), entry.destinationName);
    }
  }
  return map;
}
