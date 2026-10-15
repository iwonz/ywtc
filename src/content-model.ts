import transform from '@diplodoc/transform';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {load} from 'cheerio';
import {LinkifyIt} from 'linkify-it';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import rehypeSanitize, {defaultSchema, type Options as SanitizeSchema} from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import {unified} from 'unified';
import type {
  DestinationPage,
  NormalizedDocument,
  NormalizedNode,
  NormalizedReference,
  PageReference,
  RenderContext,
  RenderResourceBinding,
  RenderedDocument,
  SourcePage,
  SourceResource,
} from './domain.js';
import {convertYfmToStorage} from './conversion.js';
import {normalizeWikiSlug, resolveRelativeWikiSlug} from './input.js';

const linkifier = new LinkifyIt();

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function absoluteResourceUrl(page: SourcePage, resource: SourceResource): string {
  if (resource.downloadUrl) {
    try {
      return new URL(resource.downloadUrl, page.url).toString();
    } catch {
      // Fall through to the page URL so the resource remains discoverable.
    }
  }
  return page.url;
}

function normalizedResourceAlias(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let normalized = trimmed;
  try {
    normalized = decodeURIComponent(trimmed);
  } catch {
    // Keep provider text when percent encoding is malformed.
  }
  return normalized.replace(/\\/g, '/').replace(/^\.\//, '').toLocaleLowerCase();
}

function resourceAliasCandidates(reference: string): string[] {
  const aliases = new Set<string>();
  const add = (value: string | undefined): void => {
    if (!value) return;
    const normalized = normalizedResourceAlias(value);
    if (!normalized) return;
    aliases.add(normalized);
    aliases.add(normalized.replace(/^attachment:/, ''));
    aliases.add(normalized.replace(/^\/+/, ''));
    const marker = normalized.match(/(?:^|\/)((?:\.files|_files|attachments)\/.*)$/i)?.[1];
    if (marker) aliases.add(marker);
  };
  const withoutFragment = reference.split('#', 1)[0] ?? reference;
  add(withoutFragment);
  try {
    const url = new URL(withoutFragment);
    add(url.pathname);
  } catch {
    // Relative references are already covered above.
  }
  const snapshot = [...aliases];
  for (const alias of snapshot) add(alias.split('/').at(-1));
  return [...aliases];
}

export function preferredResourceName(resource: SourceResource): string {
  return resource.preferredName ?? resource.name;
}

export function sourceResourceAliases(page: SourcePage, resource: SourceResource): string[] {
  const aliases = new Set<string>();
  const add = (value: string | undefined): void => {
    for (const alias of value ? resourceAliasCandidates(value) : []) aliases.add(alias);
  };
  add(resource.name);
  add(resource.preferredName);
  add(resource.downloadUrl);
  for (const alias of resource.referenceAliases ?? []) add(alias);
  add(absoluteResourceUrl(page, resource));
  return [...aliases];
}

export function sourceResourceBindings(page: SourcePage, resources: SourceResource[]): Map<string, RenderResourceBinding> {
  const bindings = new Map<string, RenderResourceBinding>();
  const aliases = new Map<string, SourceResource[]>();
  for (const resource of resources.filter((item) => item.kind !== 'grid')) {
    for (const alias of sourceResourceAliases(page, resource)) {
      const matched = aliases.get(alias) ?? [];
      if (!matched.some((candidate) => candidate.id === resource.id)) matched.push(resource);
      aliases.set(alias, matched);
    }
  }
  for (const [alias, matched] of aliases) {
    if (matched.length !== 1) continue;
    const resource = matched[0]!;
    bindings.set(alias, {kind: 'source', resource, url: absoluteResourceUrl(page, resource)});
  }
  return bindings;
}

export function setSourceResourceBinding(
  bindings: Map<string, RenderResourceBinding>,
  page: SourcePage,
  resources: SourceResource[],
  resource: SourceResource,
  binding: RenderResourceBinding,
): void {
  const aliasOwners = new Map<string, Set<string>>();
  for (const candidate of resources.filter((item) => item.kind !== 'grid')) {
    for (const alias of sourceResourceAliases(page, candidate)) {
      const owners = aliasOwners.get(alias) ?? new Set<string>();
      owners.add(candidate.id);
      aliasOwners.set(alias, owners);
    }
  }
  for (const alias of sourceResourceAliases(page, resource)) {
    if (aliasOwners.get(alias)?.size === 1) bindings.set(alias, binding);
  }
}

function bindingTarget(binding: RenderResourceBinding): string | undefined {
  return binding.kind === 'uploaded' ? binding.resource.url ?? binding.resource.name
    : binding.kind === 'source' ? binding.url
      : binding.path;
}

function resourceBinding(reference: string, context: RenderContext): RenderResourceBinding | undefined {
  for (const alias of resourceAliasCandidates(reference)) {
    const binding = context.resources.get(alias);
    if (binding) return binding;
  }
  return undefined;
}

function uniqueReferences(references: PageReference[]): PageReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.href ?? reference.pageTitle ?? reference.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyHref(raw: string): PageReference {
  const href = raw.trim();
  if (href.startsWith('#')) return {raw, href, anchor: href.slice(1), kind: 'anchor'};
  if (/^(?:mailto|tel):/i.test(href)) return {raw, href, kind: 'external'};
  if (/^https?:\/\//i.test(href)) return {raw, href, kind: 'page'};
  if (/^(?:javascript|data):/i.test(href)) return {raw, href, kind: 'unsupported'};
  if (/\.(?:png|jpe?g|gif|webp|svg|pdf|zip|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(href) || /(?:\.files|_files|attachments)\//i.test(href)) {
    return {raw, href, kind: 'attachment'};
  }
  return {raw, href, kind: 'page'};
}

export function extractPageReferences(content: string, format: SourcePage['rawFormat']): PageReference[] {
  const references: PageReference[] = [];
  if (format === 'confluence-storage') {
    const $ = load(`<root>${content}</root>`, {xmlMode: true}, false);
    $('ri\\:page').each((_index, element) => {
      const pageTitle = $(element).attr('ri:content-title');
      const contentId = $(element).attr('ri:content-id');
      const space = $(element).attr('ri:space-key');
      if (pageTitle || contentId) {
        references.push({
          raw: $.html(element),
          ...(pageTitle ? {pageTitle} : {}),
          href: contentId ? `confluence-page:${contentId}` : `${space ? `${space}:` : ''}${pageTitle}`,
          kind: 'page',
        });
      }
    });
    $('ri\\:attachment').each((_index, element) => {
      const filename = $(element).attr('ri:filename') ?? 'attachment';
      references.push({raw: $.html(element), href: filename, kind: 'attachment'});
    });
    $('a').each((_index, element) => {
      const href = $(element).attr('href');
      if (href) references.push(classifyHref(href));
    });
  } else {
    const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    for (const match of content.matchAll(markdownLink)) if (match[1]) references.push(classifyHref(match[1]));
    const wikiLink = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    for (const match of content.matchAll(wikiLink)) if (match[1]) references.push(classifyHref(match[1]));
    for (const match of linkifier.match(content) ?? []) references.push(classifyHref(match.url));
  }
  return uniqueReferences(references);
}

function storageToSemanticHtml(storage: string, warnings: string[]): string {
  const $ = load(`<main data-ywtc-root>${storage}</main>`, {xmlMode: false}, false);
  $('script, iframe, object, embed, form').each((_index, element) => {
    warnings.push(`Active or embedded element <${element.tagName}> was replaced by a safe fallback`);
    $(element).replaceWith(`<pre data-ywtc-fallback>${escapeHtml($.html(element))}</pre>`);
  });
  $('ac\\:structured-macro').toArray().reverse().forEach((element) => {
    const macro = $(element);
    const name = macro.attr('ac:name') ?? 'unknown';
    const richBody = macro.children('ac\\:rich-text-body').html() ?? '';
    const plainBody = macro.children('ac\\:plain-text-body').text();
    const title = macro.children('ac\\:parameter').filter((_index, item) => $(item).attr('ac:name') === 'title').text().trim();
    if (name === 'code') macro.replaceWith(`<pre><code>${escapeHtml(plainBody)}</code></pre>`);
    else if (name === 'expand') macro.replaceWith(`<details open><summary>${escapeHtml(title || 'Details')}</summary>${richBody}</details>`);
    else if (['info', 'tip', 'warning', 'note'].includes(name)) macro.replaceWith(`<aside class="ywtc-${name}"><strong>${escapeHtml(title || name)}</strong>${richBody}</aside>`);
    else if (name === 'anchor') macro.replaceWith(`<span id="${escapeHtml(macro.children('ac\\:parameter').first().text())}"></span>`);
    else {
      warnings.push(`Confluence macro "${name}" was converted to a static fallback`);
      macro.replaceWith(`<aside class="ywtc-fallback"><strong>${escapeHtml(name)}</strong>${richBody || `<pre>${escapeHtml(plainBody)}</pre>`}</aside>`);
    }
  });
  $('ac\\:image').each((_index, element) => {
    const image = $(element);
    const attachment = image.children('ri\\:attachment').attr('ri:filename');
    const external = image.children('ri\\:url').attr('ri:value');
    const source = attachment ? `attachment:${attachment}` : external;
    image.replaceWith(source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(image.attr('ac:alt') ?? attachment ?? '')}">` : '<span>[image]</span>');
  });
  $('ac\\:link').each((_index, element) => {
    const link = $(element);
    const page = link.children('ri\\:page');
    const attachment = link.children('ri\\:attachment').attr('ri:filename');
    const label = link.children('ac\\:link-body, ac\\:plain-text-link-body').text().trim()
      || page.attr('ri:content-title') || attachment || 'Link';
    const href = page.length
      ? `page:${page.attr('ri:content-id') ?? page.attr('ri:content-title') ?? ''}`
      : attachment ? `attachment:${attachment}` : `#${link.attr('ac:anchor') ?? ''}`;
    link.replaceWith(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
  });
  $('ri\\:attachment').each((_index, element) => {
    const filename = $(element).attr('ri:filename') ?? 'attachment';
    $(element).replaceWith(`<a href="attachment:${escapeHtml(filename)}">${escapeHtml(filename)}</a>`);
  });
  $('ri\\:page').each((_index, element) => {
    const title = $(element).attr('ri:content-title') ?? 'page';
    $(element).replaceWith(`<a href="page:${escapeHtml(title)}">${escapeHtml(title)}</a>`);
  });
  $('ac\\:parameter, ac\\:rich-text-body, ac\\:plain-text-body, ac\\:link-body, ac\\:plain-text-link-body').each((_index, element) => {
    $(element).replaceWith($(element).contents());
  });
  return $('main[data-ywtc-root]').html() ?? '';
}

export function stripAnsi(value: string): string {
  let output = '';
  for (let index = 0; index < value.length;) {
    const code = value.charCodeAt(index);
    const controlSequence = code === 0x9b || (code === 0x1b && value[index + 1] === '[');
    if (controlSequence) {
      index += code === 0x9b ? 1 : 2;
      while (index < value.length) {
        const current = value.charCodeAt(index++);
        if (current >= 0x40 && current <= 0x7e) break;
      }
      continue;
    }
    if (code === 0x1b && value[index + 1] === ']') {
      index += 2;
      while (index < value.length) {
        if (value.charCodeAt(index) === 0x07) {
          index += 1;
          break;
        }
        if (value.charCodeAt(index) === 0x1b && value[index + 1] === '\\') {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (code === 0x1b) {
      index += Math.min(2, value.length - index);
      continue;
    }
    output += value[index];
    index += 1;
  }
  return output;
}

interface TreeDirective {
  raw: string;
  depth?: number;
  sort?: 'asc' | 'desc';
  sortBy?: 'title';
}

function extractTreeDirectives(content: string): {content: string; directives: TreeDirective[]} {
  const directives: TreeDirective[] = [];
  const next = content.replace(/{%\s*tree\b([^%]*?)%}/gi, (raw, attributes: string) => {
    const values = new Map<string, string>();
    for (const match of attributes.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)) {
      if (match[1] && match[2] !== undefined) values.set(match[1].toLocaleLowerCase(), match[2].toLocaleLowerCase());
    }
    const depthValue = Number(values.get('depth'));
    const sort = values.get('sort');
    const sortBy = values.get('sort_by');
    directives.push({
      raw,
      ...(Number.isInteger(depthValue) && depthValue > 0 ? {depth: depthValue} : {}),
      ...(sort === 'asc' || sort === 'desc' ? {sort} : {}),
      ...(sortBy === 'title' ? {sortBy} : {}),
    });
    return '';
  });
  return {content: next, directives};
}

function containsEmptyYfmHeading(content: string): boolean {
  return /^\s{0,3}#{1,6}\s*$/m.test(content);
}

function yfmToHtml(content: string, warnings: string[], normalizations: string[] = []): string {
  try {
    const result = transform(content || '', {
      allowHTML: true,
      needToSanitizeHtml: true,
      supportGithubAnchors: true,
      lang: 'ru',
      linkify: true,
    });
    const $ = load(result.result.html || '<p></p>', null, false);
    let removedHeadings = 0;
    $('h1,h2,h3,h4,h5,h6').each((_index, element) => {
      const heading = $(element);
      const meaningful = heading.text().replace(/\s+/g, '').length > 0
        || heading.find('img,table,pre,code').length > 0;
      if (meaningful) return;
      heading.find('[id],a[name]').each((_anchorIndex, anchor) => { heading.before($(anchor).clone()); });
      heading.remove();
      removedHeadings += 1;
    });
    let ignoredHeaderDiagnostics = removedHeadings;
    for (const diagnostic of [...(result.logs.warn ?? []), ...(result.logs.error ?? [])]) {
      const clean = stripAnsi(String(diagnostic)).trim();
      if (/Header without title/i.test(clean)) {
        if (ignoredHeaderDiagnostics > 0) ignoredHeaderDiagnostics -= 1;
        if (removedHeadings > 0 || !containsEmptyYfmHeading(content)) continue;
      }
      if (clean) warnings.push(clean);
    }
    if (removedHeadings > 0) normalizations.push(`Removed ${removedHeadings} empty heading${removedHeadings === 1 ? '' : 's'} emitted by source conversion`);
    return $.html() || '<p></p>';
  } catch (error) {
    warnings.push(`YFM transformation failed: ${stripAnsi(error instanceof Error ? error.message : String(error))}`);
    return `<pre data-ywtc-fallback><code>${escapeHtml(content)}</code></pre>`;
  }
}

function metrics(html: string): NormalizedDocument['metrics'] {
  const $ = load(html, null, false);
  return {links: $('a').length, images: $('img').length, tables: $('table').length, codeBlocks: $('pre').length};
}

export function normalizePageContent(page: SourcePage): NormalizedDocument {
  const warnings: string[] = [];
  const normalizations: string[] = [];
  const tree = page.rawFormat === 'yfm' ? extractTreeDirectives(page.rawContent) : {content: page.rawContent, directives: []};
  const html = page.rawFormat === 'yfm' ? yfmToHtml(tree.content, warnings, normalizations) : storageToSemanticHtml(page.rawContent, warnings);
  const references = extractPageReferences(page.rawContent, page.rawFormat).map<NormalizedReference>((reference, index) => ({
    token: `ref-${index}`,
    kind: reference.kind,
    raw: reference.raw,
    ...(reference.href ? {href: reference.href} : {}),
    label: reference.pageTitle ?? reference.href ?? reference.raw,
    ...(reference.anchor ? {anchor: reference.anchor} : {}),
  }));
  const children: NormalizedNode[] = [{type: 'html', value: html}];
  children.push(...tree.directives.map((directive): NormalizedNode => ({
    type: 'tree-directive',
    value: directive.raw,
    tree: {
      ...(directive.depth ? {depth: directive.depth} : {}),
      ...(directive.sort ? {sort: directive.sort} : {}),
      ...(directive.sortBy ? {sortBy: directive.sortBy} : {}),
    },
  })));
  if (warnings.length > 0) children.push({type: 'vendor-extension', vendor: page.provider, value: page.rawContent});
  return {
    root: {type: 'document', children},
    raw: page.rawContent,
    rawFormat: page.rawFormat,
    references,
    warnings,
    normalizations,
    degraded: warnings.length > 0,
    metrics: metrics(html),
  };
}

function gridCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) return value.map(gridCell).join(', ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return gridCell(record.display_name ?? record.display ?? record.name ?? record.username ?? JSON.stringify(value));
  }
  return String(value);
}

export function appendGridSnapshots(document: NormalizedDocument, resources: SourceResource[]): NormalizedDocument {
  const grids = resources.filter((resource) => resource.kind === 'grid');
  if (grids.length === 0) return document;
  const html = grids.map((resource) => {
    const grid = resource.metadata?.grid as {title?: string; structure?: {columns?: Array<{title?: string}>}; rows?: Array<{row?: unknown[]}>} | undefined;
    const columns = grid?.structure?.columns ?? [];
    const rows = grid?.rows ?? [];
    return `<section class="ywtc-grid"><h2>${escapeHtml(grid?.title ?? resource.name)}</h2><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title ?? '')}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((_column, index) => `<td>${escapeHtml(gridCell(row.row?.[index]))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  }).join('');
  const htmlNode = document.root.children?.find((node) => node.type === 'html');
  if (htmlNode) htmlNode.value = `${htmlNode.value ?? ''}${html}`;
  return {
    ...document,
    warnings: [...document.warnings, ...grids.map((resource) => `Dynamic table "${resource.name}" was converted to a static table`)],
    degraded: true,
    metrics: {...document.metrics, tables: document.metrics.tables + grids.length},
  };
}

async function htmlToMarkdown(html: string): Promise<string> {
  const result = await unified()
    .use(rehypeParse, {fragment: true})
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, {bullet: '-', fences: true})
    .process(html);
  return `${String(result).trimEnd()}\n`;
}

async function sanitizeHtml(html: string): Promise<string> {
  const schema: SanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'aside', 'details', 'summary'],
    attributes: {
      ...defaultSchema.attributes,
      '*': [...(defaultSchema.attributes?.['*'] ?? []), ['className', /^ywtc-[\w-]+$/]],
    },
  };
  const result = await unified().use(rehypeParse, {fragment: true}).use(rehypeSanitize, schema).use(rehypeStringify).process(html);
  return String(result);
}

function htmlFromDocument(document: NormalizedDocument): string {
  return document.root.children?.find((node) => node.type === 'html')?.value ?? '<p></p>';
}

export function normalizedPreviewHtml(document: NormalizedDocument): string {
  return htmlFromDocument(document);
}

export function renderedPreviewHtml(body: string, provider: SourcePage['provider']): string {
  const warnings: string[] = [];
  return provider === 'confluence' ? storageToSemanticHtml(body, warnings) : yfmToHtml(body, warnings);
}

export function legacyTransferPlaceholder(provider: SourcePage['provider'], page: SourcePage): string {
  return provider === 'confluence'
    ? `<p><em>ywtc transfer in progress from <a href="${escapeHtml(page.url)}">${page.provider}</a>.</em></p>`
    : `_ywtc transfer in progress from [${page.provider}](${page.url})._`;
}

export function isLegacyTransferPlaceholder(body: string | undefined, provider: SourcePage['provider'], page: SourcePage): boolean {
  return body?.trim() === legacyTransferPlaceholder(provider, page).trim();
}

function markdownFence(value: string): string {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

export function rawContentFallback(page: SourcePage, provider: SourcePage['provider'], reason: string): RenderedDocument {
  const warning = `Preferred rendering failed; complete raw source is shown instead: ${reason}`;
  if (provider === 'confluence') {
    const raw = page.rawContent
      ? `<pre><code>${escapeHtml(page.rawContent)}</code></pre>`
      : '<p><em>The source page has no body content.</em></p>';
    return {
      body: `<p><strong>Source content fallback</strong> · <a href="${escapeHtml(page.url)}">original page</a></p>${raw}`,
      warnings: [warning],
      normalizations: [],
      degraded: true,
      representedReferences: page.references.length,
    };
  }
  const raw = page.rawContent
    ? `${markdownFence(page.rawContent)}text\n${page.rawContent}\n${markdownFence(page.rawContent)}`
    : '_The source page has no body content._';
  return {
    body: `**Source content fallback** · [original page](${page.url})\n\n${raw}\n`,
    warnings: [warning],
    normalizations: [],
    degraded: true,
    representedReferences: page.references.length,
  };
}

function semanticText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

interface SemanticContent {
  text: string;
  headings: string[];
  listItems: string[];
  tableCells: string[];
  code: string[];
  links: string[];
  images: string[];
  anchors: string[];
  structure: {lists: number; rows: number; details: number; asides: number; codeBlocks: number};
  macros: string[];
}

function semanticContent(body: string, provider: SourcePage['provider']): SemanticContent {
  const html = renderedPreviewHtml(body, provider);
  const $ = load(html, null, false);
  $('script,style').remove();
  $('h1,h2,h3,h4,h5,h6,p,div,span').each((_index, element) => {
    const node = $(element);
    if (!semanticText(node.text()) && node.find('img,table,pre,code,a[href]').length === 0) node.remove();
  });
  const textValues = (selector: string): string[] => $(selector).toArray().map((element) => semanticText($(element).text()));
  const macroNames: string[] = [];
  if (provider === 'confluence') {
    const storage = load(`<root>${body}</root>`, {xmlMode: true}, false);
    storage('ac\\:structured-macro').each((_index, element) => {
      const macro = storage(element);
      const name = macro.attr('ac:name') ?? 'unknown';
      const parameters = macro.children('ac\\:parameter').toArray().map((parameter) => (
        `${storage(parameter).attr('ac:name') ?? ''}=${semanticText(storage(parameter).text())}`
      )).sort();
      macroNames.push(`${name}[${parameters.join(',')}]`);
    });
  }
  return {
    text: semanticText($.root().text()),
    headings: $('h1,h2,h3,h4,h5,h6').toArray().map((element) => `${element.tagName}:${semanticText($(element).text())}`),
    listItems: textValues('li'),
    tableCells: $('th,td').toArray().map((element) => `${element.tagName}:${semanticText($(element).text())}`),
    code: textValues('pre,code'),
    links: $('a[href]').toArray().map((element) => `${$(element).attr('href') ?? ''}|${semanticText($(element).text())}`).sort(),
    images: $('img').toArray().map((element) => `${$(element).attr('src') ?? ''}|${$(element).attr('alt') ?? ''}`).sort(),
    anchors: $('[id],a[name]').toArray().map((element) => $(element).attr('id') ?? $(element).attr('name') ?? '').filter(Boolean).sort(),
    structure: {
      lists: $('ul,ol').length,
      rows: $('tr').length,
      details: $('details').length,
      asides: $('aside').length,
      codeBlocks: $('pre').length,
    },
    macros: macroNames.sort(),
  };
}

export function semanticContentFingerprint(body: string, provider: SourcePage['provider']): string {
  return sha256(JSON.stringify(semanticContent(body, provider)));
}

export interface ContentVerificationResult {
  status: 'complete' | 'partial' | 'failed';
  differences: string[];
}

export function verifyDestinationContent(
  expectedBody: string,
  actualBody: string | undefined,
  provider: SourcePage['provider'],
  page: SourcePage,
): ContentVerificationResult {
  if (actualBody === undefined) return {status: 'failed', differences: [`Verification could not read destination content for ${page.title}`]};
  if (actualBody.trim().length === 0) return {status: 'failed', differences: [`Verification found empty destination content for ${page.title}`]};
  if (isLegacyTransferPlaceholder(actualBody, provider, page)) {
    return {status: 'failed', differences: [`Verification found a transfer placeholder instead of source content for ${page.title}`]};
  }
  const expected = semanticContent(expectedBody, provider);
  const actual = semanticContent(actualBody, provider);
  const differs = (key: keyof SemanticContent): boolean => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]);
  const missingData = (['text', 'tableCells', 'code', 'links', 'images', 'anchors', 'macros'] as const).filter(differs);
  if (missingData.length > 0) {
    return {
      status: 'failed',
      differences: [`Verification found destination content that differs from the rendered source for ${page.title}: ${missingData.join(', ')}`],
    };
  }
  const simplifiedFormatting = (['headings', 'listItems', 'structure'] as const).filter(differs);
  if (simplifiedFormatting.length > 0) {
    return {
      status: 'partial',
      differences: [`Destination formatting was simplified for ${page.title}: ${simplifiedFormatting.join(', ')}`],
    };
  }
  return {status: 'complete', differences: []};
}

export function assertDestinationContent(
  expectedBody: string,
  actualBody: string | undefined,
  provider: SourcePage['provider'],
  page: SourcePage,
): ContentVerificationResult {
  const result = verifyDestinationContent(expectedBody, actualBody, provider, page);
  if (result.status === 'failed') throw new Error(result.differences.join('; '));
  return result;
}

function relativeTarget(currentPath: string | undefined, targetPath: string): string {
  if (!currentPath) return targetPath;
  const from = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '.';
  const relative = path.posix.relative(from, targetPath);
  return relative || path.posix.basename(targetPath);
}

function rewritePortableHtml(html: string, context: RenderContext): string {
  const $ = load(html, null, false);
  $('a').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const current = context.sourcePages.get(context.currentPageId);
    const pageToken = href.startsWith('page:') ? href.slice('page:'.length) : undefined;
    const yandexSlug = current?.provider === 'yandex-wiki' ? resolveYandexReferenceSlug(current, href) : undefined;
    const pageCandidate = [...context.sourcePages.values()].find((page) => (
      page.url === href
      || page.locator === href
      || href.endsWith(`/${page.locator}`)
      || (pageToken !== undefined && (page.id === pageToken || page.title === pageToken))
      || (yandexSlug !== undefined && normalizeWikiSlug(page.locator) === yandexSlug)
    ));
    if (pageCandidate) {
      const destination = context.pages.get(pageCandidate.canonicalId);
      if (destination) {
        $(element).attr('href', 'path' in destination
          ? relativeTarget(context.currentPath, destination.path)
          : destination.url);
      }
      return;
    }
    const resource = resourceBinding(href, context);
    const target = resource ? bindingTarget(resource) : undefined;
    if (resource && target) {
      $(element).attr('href', resource.kind === 'file' ? relativeTarget(context.currentPath, target) : target);
    }
  });
  $('img').each((_index, element) => {
    const src = $(element).attr('src') ?? '';
    const resource = resourceBinding(src, context);
    const target = resource ? bindingTarget(resource) : undefined;
    if (resource && target) {
      $(element).attr('src', resource.kind === 'file' ? relativeTarget(context.currentPath, target) : target);
    }
  });
  return $.html();
}

function treeDirectiveNodes(document: NormalizedDocument): NormalizedNode[] {
  return document.root.children?.filter((node) => node.type === 'tree-directive') ?? [];
}

function treeChildren(context: RenderContext, parentId: string, directive: NonNullable<NormalizedNode['tree']>, depth = 1): SourcePage[] {
  if (directive.depth !== undefined && depth > directive.depth) return [];
  return [...context.sourcePages.values()]
    .filter((page) => (page as SourcePage & {projectedParentId?: string}).projectedParentId === parentId)
    .sort((left, right) => {
      const order = directive.sortBy === 'title' ? left.title.localeCompare(right.title) : left.canonicalId.localeCompare(right.canonicalId);
      return directive.sort === 'desc' ? -order : order;
    });
}

function renderTreeMarkdown(context: RenderContext, directive: NonNullable<NormalizedNode['tree']>): string {
  const render = (parentId: string, depth: number): string => treeChildren(context, parentId, directive, depth).map((page) => {
    const destination = context.pages.get(page.canonicalId);
    if (!destination) return '';
    const href = 'path' in destination ? relativeTarget(context.currentPath, destination.path) : destination.url;
    const nested = render(page.canonicalId, depth + 1);
    return `${'  '.repeat(depth - 1)}- [${page.title}](${href})${nested ? `\n${nested}` : ''}`;
  }).filter(Boolean).join('\n');
  return render(context.currentPageId, 1);
}

function renderTreeHtml(context: RenderContext, directive: NonNullable<NormalizedNode['tree']>): string {
  const render = (parentId: string, depth: number): string => {
    const items = treeChildren(context, parentId, directive, depth).map((page) => {
      const destination = context.pages.get(page.canonicalId);
      if (!destination) return '';
      const href = 'path' in destination ? relativeTarget(context.currentPath, destination.path) : destination.url;
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(page.title)}</a>${render(page.canonicalId, depth + 1)}</li>`;
    }).filter(Boolean).join('');
    return items ? `<ul>${items}</ul>` : '';
  };
  const tree = render(context.currentPageId, 1);
  return tree ? `<nav class="ywtc-tree" aria-label="Child pages">${tree}</nav>` : '';
}

export async function renderMarkdown(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  const html = rewritePortableHtml(htmlFromDocument(document), context);
  const tree = treeDirectiveNodes(document).map((node) => renderTreeMarkdown(context, node.tree ?? {})).filter(Boolean).join('\n\n');
  const content = await htmlToMarkdown(html);
  const body = tree ? `${content.trimEnd()}\n\n${tree}\n` : content;
  return {body, warnings: [...document.warnings], normalizations: [...(document.normalizations ?? [])], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderStaticHtml(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  const rewritten = rewritePortableHtml(htmlFromDocument(document), context);
  const content = await sanitizeHtml(rewritten);
  const tree = treeDirectiveNodes(document).map((node) => renderTreeHtml(context, node.tree ?? {})).filter(Boolean).join('');
  const body = `${content}${tree}`;
  return {body, warnings: [...document.warnings], normalizations: [...(document.normalizations ?? [])], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderYfm(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  if (document.rawFormat === 'yfm') {
    let body = document.raw;
    const resourceWarnings = new Set<string>();
    const replacement = (href: string): string | undefined => {
      const current = context.sourcePages.get(context.currentPageId);
      if (!current) return undefined;
      const slug = current.provider === 'yandex-wiki' ? resolveYandexReferenceSlug(current, href) : undefined;
      const source = [...context.sourcePages.values()].find((candidate) => (
        candidate.url === href
        || (slug !== undefined && normalizeWikiSlug(candidate.locator) === slug)
      ));
      const destination = source ? context.pages.get(source.canonicalId) : undefined;
      return destination && 'locator' in destination && destination.locator ? destination.locator : undefined;
    };
    body = body.replace(/(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))/g, (match, prefix: string, href: string, suffix: string) => {
      const next = replacement(href);
      if (next) return `${prefix}${next}${suffix}`;
      const binding = resourceBinding(href, context);
      const target = binding ? bindingTarget(binding) : undefined;
      if (binding?.kind === 'source') resourceWarnings.add(`Resource uses its source fallback because it was not transferred: ${binding.resource.name}`);
      return target ? `${prefix}${target}${suffix}` : match;
    });
    body = body.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (match, href: string, label = '') => {
      const next = replacement(href);
      return next ? `[[${next}${label}]]` : match;
    });
    for (const source of context.sourcePages.values()) {
      const destination = context.pages.get(source.canonicalId);
      if (destination && 'locator' in destination && destination.locator) body = body.replaceAll(source.url, destination.locator);
    }
    const $ = load(htmlFromDocument(document), null, false);
    const gridHtml = $('.ywtc-grid').toArray().map((element) => $.html(element)).join('');
    if (gridHtml) body = `${body.trimEnd()}\n\n${(await htmlToMarkdown(gridHtml)).trimStart()}`;
    return {
      body,
      warnings: [...document.warnings, ...resourceWarnings],
      normalizations: [...(document.normalizations ?? [])],
      degraded: document.degraded || resourceWarnings.size > 0,
      representedReferences: document.references.length,
    };
  }
  const body = await htmlToMarkdown(rewritePortableHtml(htmlFromDocument(document), context));
  return {body, warnings: [...document.warnings, 'Confluence Storage Format was converted to YFM-compatible Markdown'], normalizations: [...(document.normalizations ?? [])], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderConfluenceStorage(document: NormalizedDocument, page: SourcePage, context: RenderContext, spaceKey: string): Promise<RenderedDocument> {
  if (document.rawFormat === 'confluence-storage') {
    const $ = load(`<main data-root>${document.raw}</main>`, {xmlMode: true}, false);
    const warnings = [...document.warnings];
    $('ac\\:image').each((_index, element) => {
      const image = $(element);
      const attachment = image.children('ri\\:attachment');
      const filename = attachment.attr('ri:filename');
      if (!filename) return;
      const binding = resourceBinding(filename, context);
      if (!binding) return;
      if (binding.kind === 'uploaded') {
        attachment.attr('ri:filename', binding.resource.name);
        return;
      }
      const target = bindingTarget(binding);
      if (!target) return;
      warnings.push(`Image uses its source fallback because it was not transferred: ${filename}`);
      attachment.replaceWith(`<ri:url ri:value="${escapeHtml(target)}"/>`);
    });
    $('ac\\:link').each((_index, element) => {
      const link = $(element);
      const attachment = link.children('ri\\:attachment');
      const filename = attachment.attr('ri:filename');
      if (!filename) return;
      const binding = resourceBinding(filename, context);
      if (!binding) return;
      if (binding.kind === 'uploaded') {
        attachment.attr('ri:filename', binding.resource.name);
        return;
      }
      const target = bindingTarget(binding);
      if (!target) return;
      const label = link.children('ac\\:link-body, ac\\:plain-text-link-body').text().trim() || filename;
      warnings.push(`Attachment uses its source fallback because it was not transferred: ${filename}`);
      link.replaceWith(`<a href="${escapeHtml(target)}">${escapeHtml(label)}</a>`);
    });
    $('ri\\:attachment').each((_index, element) => {
      const attachment = $(element);
      const filename = attachment.attr('ri:filename');
      if (!filename) return;
      const binding = resourceBinding(filename, context);
      if (!binding) return;
      if (binding.kind === 'uploaded') {
        attachment.attr('ri:filename', binding.resource.name);
        return;
      }
      const target = bindingTarget(binding);
      if (!target) return;
      warnings.push(`Attachment uses its source fallback because it was not transferred: ${filename}`);
      attachment.replaceWith(`<a href="${escapeHtml(target)}">${escapeHtml(filename)}</a>`);
    });
    $('ri\\:page').each((_index, element) => {
      const title = $(element).attr('ri:content-title');
      const id = $(element).attr('ri:content-id');
      const sourceSpace = $(element).attr('ri:space-key');
      const source = [...context.sourcePages.values()].find((candidate) => (
        candidate.id === id || (candidate.title === title && (!sourceSpace || candidate.space === sourceSpace))
      ));
      const destination = source ? context.pages.get(source.canonicalId) : undefined;
      if (destination && 'title' in destination) {
        const destinationSpace = 'provider' in destination ? destination.space : undefined;
        $(element)
          .attr('ri:content-title', destination.title)
          .attr('ri:space-key', destinationSpace ?? spaceKey)
          .removeAttr('ri:content-id');
      }
    });
    return {
      body: $('main[data-root]').html() ?? '<p></p>',
      warnings,
      normalizations: [...(document.normalizations ?? [])],
      degraded: document.degraded || warnings.length > document.warnings.length,
      representedReferences: document.references.length,
    };
  }
  const pagesBySlug = new Map<string, {sourceId: number; slug: string; destinationTitle: string}>();
  for (const source of context.sourcePages.values()) {
    const destination = context.pages.get(source.canonicalId);
    if (!destination || !('title' in destination)) continue;
    const numericId = Number(source.id);
    pagesBySlug.set(normalizeWikiSlug(source.locator).toLocaleLowerCase(), {
      sourceId: Number.isFinite(numericId) ? numericId : 0,
      slug: source.locator,
      destinationTitle: destination.title,
    });
  }
  const attachments = new Map<string, string>();
  const resourceFallbacks = new Map<string, string>();
  for (const [name, binding] of context.resources) {
    if (binding.kind === 'uploaded') attachments.set(name, binding.resource.name);
    else if (binding.kind === 'source' && binding.url) resourceFallbacks.set(name, binding.url);
  }
  const tree = extractTreeDirectives(document.raw);
  const converted = convertYfmToStorage(tree.content, {
    currentSlug: page.locator,
    spaceKey,
    wikiWebUrl: new URL(page.url).origin,
    pagesBySlug,
    attachmentsByReference: attachments,
    resourceFallbacksByReference: resourceFallbacks,
  });
  const normalizedStorage = load(`<main data-root>${converted.storage}</main>`, {xmlMode: true}, false);
  let removedHeadings = 0;
  normalizedStorage('h1,h2,h3,h4,h5,h6').each((_index, element) => {
    const heading = normalizedStorage(element);
    if (semanticText(heading.text()) || heading.find('img,table,pre,code').length > 0) return;
    heading.find('[id],a[name]').each((_anchorIndex, anchor) => { heading.before(normalizedStorage(anchor).clone()); });
    heading.remove();
    removedHeadings += 1;
  });
  let ignorableHeaderWarnings = removedHeadings;
  const conversionWarnings = converted.warnings.map(stripAnsi).filter((warning) => {
    if (/Header without title/i.test(warning)) {
      if (ignorableHeaderWarnings > 0) ignorableHeaderWarnings -= 1;
      if (removedHeadings > 0 || !containsEmptyYfmHeading(tree.content)) return false;
    }
    return Boolean(warning.trim());
  });
  const normalizations = [...(document.normalizations ?? [])];
  if (removedHeadings > 0 && !normalizations.some((item) => /empty heading/i.test(item))) {
    normalizations.push(`Removed ${removedHeadings} empty heading${removedHeadings === 1 ? '' : 's'} emitted by source conversion`);
  }
  const treeStorage = tree.directives.map((directive) => {
    const parameters = [
      directive.depth ? `<ac:parameter ac:name="depth">${directive.depth}</ac:parameter>` : '',
      directive.sortBy ? `<ac:parameter ac:name="sort">${directive.sortBy}</ac:parameter>` : '',
      directive.sort ? `<ac:parameter ac:name="reverse">${directive.sort === 'desc' ? 'true' : 'false'}</ac:parameter>` : '',
    ].join('');
    return `<ac:structured-macro ac:name="children">${parameters}</ac:structured-macro>`;
  }).join('');
  const $ = load(htmlFromDocument(document), null, false);
  const gridStorage = $('.ywtc-grid').toArray().map((element) => $(element).html() ?? '').join('');
  return {
    body: `${normalizedStorage('main[data-root]').html() ?? '<p></p>'}${treeStorage}${gridStorage}`,
    warnings: [...document.warnings, ...conversionWarnings],
    normalizations,
    degraded: document.degraded || conversionWarnings.length > 0,
    representedReferences: document.references.length,
  };
}

export function resolveYandexReferenceSlug(page: SourcePage, href: string): string | undefined {
  if (href.startsWith('#') || /^(?:mailto|tel):/i.test(href)) return undefined;
  try {
    const target = new URL(href);
    if (target.origin !== new URL(page.url).origin) return undefined;
    return normalizeWikiSlug(target.pathname);
  } catch {
    const clean = href.split(/[?#]/, 1)[0];
    if (!clean) return undefined;
    return clean.startsWith('/') ? normalizeWikiSlug(clean) : resolveRelativeWikiSlug(page.locator, clean);
  }
}

export function destinationPageFromPath(path: string, title: string): DestinationPage {
  return {provider: 'confluence', profile: 'filesystem', id: path, canonicalId: path, title, url: path, locator: path};
}
