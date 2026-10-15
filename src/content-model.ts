import transform from '@diplodoc/transform';
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
  RenderedDocument,
  SourcePage,
  SourceResource,
} from './domain.js';
import {convertYfmToStorage} from './conversion.js';
import {normalizeWikiSlug, resolveRelativeWikiSlug} from './input.js';

const linkifier = new LinkifyIt();

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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

function yfmToHtml(content: string, warnings: string[]): string {
  try {
    const result = transform(content || '', {
      allowHTML: true,
      needToSanitizeHtml: true,
      supportGithubAnchors: true,
      lang: 'ru',
      linkify: true,
    });
    warnings.push(...(result.logs.warn ?? []), ...(result.logs.error ?? []));
    return result.result.html || '<p></p>';
  } catch (error) {
    warnings.push(`YFM transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    return `<pre data-ywtc-fallback><code>${escapeHtml(content)}</code></pre>`;
  }
}

function metrics(html: string): NormalizedDocument['metrics'] {
  const $ = load(html, null, false);
  return {links: $('a').length, images: $('img').length, tables: $('table').length, codeBlocks: $('pre').length};
}

export function normalizePageContent(page: SourcePage): NormalizedDocument {
  const warnings: string[] = [];
  const html = page.rawFormat === 'yfm' ? yfmToHtml(page.rawContent, warnings) : storageToSemanticHtml(page.rawContent, warnings);
  const references = extractPageReferences(page.rawContent, page.rawFormat).map<NormalizedReference>((reference, index) => ({
    token: `ref-${index}`,
    kind: reference.kind,
    raw: reference.raw,
    ...(reference.href ? {href: reference.href} : {}),
    label: reference.pageTitle ?? reference.href ?? reference.raw,
    ...(reference.anchor ? {anchor: reference.anchor} : {}),
  }));
  const children: NormalizedNode[] = [{type: 'html', value: html}];
  if (warnings.length > 0) children.push({type: 'vendor-extension', vendor: page.provider, value: page.rawContent});
  return {
    root: {type: 'document', children},
    raw: page.rawContent,
    rawFormat: page.rawFormat,
    references,
    warnings,
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
    const attachmentName = href.replace(/^attachment:/, '').split('/').at(-1)?.toLocaleLowerCase();
    const resource = attachmentName ? context.resources.get(attachmentName) : undefined;
    if (resource) $(element).attr('href', 'path' in resource ? relativeTarget(context.currentPath, resource.path) : resource.url ?? resource.name);
  });
  $('img').each((_index, element) => {
    const src = $(element).attr('src') ?? '';
    const name = src.replace(/^attachment:/, '').split('/').at(-1);
    if (!name) return;
    const resource = context.resources.get(name.toLocaleLowerCase());
    if (resource && 'path' in resource) $(element).attr('src', relativeTarget(context.currentPath, resource.path));
  });
  return $.html();
}

export async function renderMarkdown(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  const html = rewritePortableHtml(htmlFromDocument(document), context);
  const body = await htmlToMarkdown(html);
  return {body, warnings: [...document.warnings], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderStaticHtml(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  const rewritten = rewritePortableHtml(htmlFromDocument(document), context);
  const body = await sanitizeHtml(rewritten);
  return {body, warnings: [...document.warnings], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderYfm(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  if (document.rawFormat === 'yfm') {
    let body = document.raw;
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
      return next ? `${prefix}${next}${suffix}` : match;
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
    return {body, warnings: [...document.warnings], degraded: document.degraded, representedReferences: document.references.length};
  }
  const body = await htmlToMarkdown(rewritePortableHtml(htmlFromDocument(document), context));
  return {body, warnings: [...document.warnings, 'Confluence Storage Format was converted to YFM-compatible Markdown'], degraded: document.degraded, representedReferences: document.references.length};
}

export async function renderConfluenceStorage(document: NormalizedDocument, page: SourcePage, context: RenderContext, spaceKey: string): Promise<RenderedDocument> {
  if (document.rawFormat === 'confluence-storage') {
    const $ = load(`<main data-root>${document.raw}</main>`, {xmlMode: true}, false);
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
      warnings: [...document.warnings],
      degraded: document.degraded,
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
  for (const [name, resource] of context.resources) attachments.set(name, resource.name);
  const converted = convertYfmToStorage(document.raw, {
    currentSlug: page.locator,
    spaceKey,
    wikiWebUrl: new URL(page.url).origin,
    pagesBySlug,
    attachmentsByReference: attachments,
  });
  const $ = load(htmlFromDocument(document), null, false);
  const gridStorage = $('.ywtc-grid').toArray().map((element) => $(element).html() ?? '').join('');
  return {
    body: `${converted.storage}${gridStorage}`,
    warnings: [...document.warnings, ...converted.warnings],
    degraded: document.degraded || converted.warnings.length > 0,
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
