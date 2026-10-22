import {createHash} from 'node:crypto';
import path from 'node:path';
import {load} from 'cheerio';
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
  TransformationNotice,
} from './domain.js';
import {convertYfmToStorage} from './conversion.js';
import {transformYfm} from './diplodoc.js';
import {normalizeWikiSlug, resolveRelativeWikiSlug} from './input.js';
import {hasYfmLayouts, parseYfmDocumentSegments} from './layout.js';
import {safeLinkifyMatches} from './safe-linkify.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function transformationNotices(input: {
  normalizations?: readonly string[];
  adaptations?: readonly string[];
  degradations?: readonly string[];
}): TransformationNotice[] {
  const code = (kind: TransformationNotice['kind'], message: string): string => {
    const normalized = message
      .toLocaleLowerCase()
      .replace(/https?:\/\/\S+/g, '<url>')
      .replace(/variable\s+[^\s]+\s+not\s+found/gi, 'variable <name> not found')
      .replace(/"[^"]+"|'[^']+'/g, '<value>')
      .replace(/\b\d+(?:\.\d+)?\b/g, '<number>')
      .replace(/\s+/g, ' ')
      .trim();
    const known = /variable <name> not found/.test(normalized)
      ? 'unresolved-yfm-variable'
      : /empty heading|header without title/.test(normalized)
        ? 'empty-heading'
        : /dynamic table/.test(normalized)
          ? 'static-grid'
          : /alternative text/.test(normalized)
            ? 'image-alternative-text'
            : /layout|column/.test(normalized)
              ? 'layout'
              : /tab/.test(normalized)
                ? 'tabs'
                : sha256(normalized).slice(0, 12);
    return `content-${kind}-${known}`;
  };
  const make = (kind: TransformationNotice['kind'], message: string): TransformationNotice => ({
    code: code(kind, message),
    kind,
    message,
    verification: kind === 'normalization'
      ? 'semantic-content-equivalence'
      : kind === 'adaptation'
        ? 'payload-preserved'
        : 'full-representation-unverified',
  });
  return [
    ...(input.normalizations ?? []).map((message) => make('normalization', message)),
    ...(input.adaptations ?? []).map((message) => make('adaptation', message)),
    ...(input.degradations ?? []).map((message) => make('degradation', message)),
  ];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function meaningfulImageAlternative(alt: string | undefined, filename: string): string | undefined {
  const value = alt?.replace(/\s+/g, ' ').trim();
  if (!value) return undefined;
  const basename = filename.split('/').at(-1) ?? filename;
  return value.localeCompare(filename, undefined, {sensitivity: 'accent'}) === 0
    || value.localeCompare(basename, undefined, {sensitivity: 'accent'}) === 0
    ? undefined
    : value;
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
    for (const match of safeLinkifyMatches(content)) references.push(classifyHref(match.url));
  }
  return uniqueReferences(references);
}

const confluenceLayoutCellCounts = new Map([
  ['single', 1],
  ['two_equal', 2],
  ['two_left_sidebar', 2],
  ['two_right_sidebar', 2],
  ['three_equal', 3],
  ['three_with_sidebars', 3],
]);

function storageToSemanticHtml(storage: string, warnings: string[], adaptations: string[] = []): string {
  const $ = load(`<main data-ywtc-root>${storage}</main>`, {xmlMode: false}, false);
  $('script, iframe, object, embed, form').each((_index, element) => {
    warnings.push(`Active or embedded element <${element.tagName}> was replaced by a safe fallback`);
    $(element).replaceWith(`<pre data-ywtc-fallback>${escapeHtml($.html(element))}</pre>`);
  });
  $('ac\\:layout').toArray().reverse().forEach((element) => {
    const layout = $(element);
    if (layout.parents('ac\\:layout').length > 0) adaptations.push('Nested Confluence layout was preserved as readable nested sections');
    const sections = layout.children('ac\\:layout-section').toArray().map((section) => {
      const item = $(section);
      const requestedType = item.attr('ac:type') ?? 'unsupported';
      const expectedCells = confluenceLayoutCellCounts.get(requestedType);
      const cells = item.children('ac\\:layout-cell').toArray();
      const sectionType = expectedCells === cells.length ? requestedType : 'unsupported';
      if (sectionType === 'unsupported') {
        adaptations.push(`Confluence layout section "${requestedType}" with ${cells.length} cells was preserved with equivalent cell content and adaptive widths`);
      }
      const body = cells.map((cell) => `<div class="ywtc-layout-cell">${$(cell).html() ?? ''}</div>`).join('');
      return `<section class="ywtc-layout-section ywtc-layout-${escapeHtml(sectionType)} ywtc-layout-columns-${cells.length}" data-ywtc-layout-type="${escapeHtml(sectionType)}">${body}</section>`;
    }).join('');
    layout.replaceWith(`<section class="ywtc-layout" data-ywtc-layout-source="confluence">${sections}</section>`);
  });
  $('ac\\:structured-macro').toArray().reverse().forEach((element) => {
    const macro = $(element);
    const name = macro.attr('ac:name') ?? 'unknown';
    const richBody = macro.children('ac\\:rich-text-body').html() ?? '';
    const plainBody = macro.children('ac\\:plain-text-body').text();
    const parameters = new Map(macro.children('ac\\:parameter').toArray().map((item) => [$(item).attr('ac:name') ?? '', $(item).text().trim()]));
    const title = parameters.get('title') ?? '';
    if (name === 'code') {
      const language = parameters.get('language');
      macro.replaceWith(`<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(plainBody)}</code></pre>`);
    } else if (name === 'expand') {
      macro.replaceWith(`<details class="ywtc-expand" data-ywtc-title="${escapeHtml(title || 'Details')}" open><summary>${escapeHtml(title || 'Details')}</summary>${richBody}</details>`);
    } else if (['info', 'tip', 'warning', 'note'].includes(name)) {
      macro.replaceWith(`<aside class="ywtc-note ywtc-${name}" data-ywtc-note-type="${name}" data-ywtc-title="${escapeHtml(title)}">${richBody}</aside>`);
    } else if (name === 'anchor') {
      macro.replaceWith(`<span class="ywtc-anchor" id="${escapeHtml(macro.children('ac\\:parameter').first().text())}"></span>`);
    } else if (name === 'children' && !parameters.get('page')) {
      const depth = Number(parameters.get('depth'));
      macro.replaceWith(`<nav class="ywtc-children" data-ywtc-depth="${Number.isInteger(depth) && depth > 0 ? depth : ''}" data-ywtc-sort="${escapeHtml(parameters.get('sort') ?? '')}" data-ywtc-reverse="${parameters.get('reverse') === 'true' ? 'true' : 'false'}"></nav>`);
    } else {
      warnings.push(`Confluence macro "${name}" was converted to a static fallback`);
      macro.replaceWith(`<aside class="ywtc-fallback"><strong>${escapeHtml(name)}</strong>${richBody || `<pre>${escapeHtml(plainBody)}</pre>`}</aside>`);
    }
  });
  $('ac\\:task-list').toArray().reverse().forEach((element) => {
    const tasks = $(element).children('ac\\:task').toArray().map((task) => {
      const item = $(task);
      const status = item.children('ac\\:task-status').text().trim() === 'complete' ? 'complete' : 'incomplete';
      const body = item.children('ac\\:task-body').html() ?? '';
      return `<li class="ywtc-task" data-ywtc-task-status="${status}">${body}</li>`;
    }).join('');
    $(element).replaceWith(`<ul class="ywtc-task-list">${tasks}</ul>`);
  });
  $('ac\\:image').each((_index, element) => {
    const image = $(element);
    const attachment = image.children('ri\\:attachment').attr('ri:filename');
    const external = image.children('ri\\:url').attr('ri:value');
    const source = attachment ? `attachment:${attachment}` : external;
    const dimensions = [
      image.attr('ac:width') ? ` width="${escapeHtml(image.attr('ac:width'))}"` : '',
      image.attr('ac:height') ? ` height="${escapeHtml(image.attr('ac:height'))}"` : '',
    ].join('');
    image.replaceWith(source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(image.attr('ac:alt') ?? attachment ?? '')}"${dimensions}>` : '<span>[image]</span>');
  });
  $('ac\\:link').each((_index, element) => {
    const link = $(element);
    const page = link.find('ri\\:page').first();
    const attachment = link.find('ri\\:attachment').first().attr('ri:filename');
    const label = link.find('ac\\:link-body, ac\\:plain-text-link-body').first().text().trim()
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

function yfmFragmentToHtml(content: string, warnings: string[], normalizations: string[]): string {
  try {
    const result = transformYfm(content || '', {
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

function yfmToHtml(content: string, warnings: string[], normalizations: string[] = []): string {
  const segments = parseYfmDocumentSegments(content);
  if (!hasYfmLayouts(segments)) return yfmFragmentToHtml(content, warnings, normalizations);
  return segments.map((segment) => {
    if (segment.type === 'content') {
      return segment.raw.trim() ? yfmFragmentToHtml(segment.raw, warnings, normalizations) : '';
    }
    const gap = segment.gap?.replace(/[^a-z0-9_-]/gi, '') || 'default';
    const cells = segment.cells.map((cell) => `<div class="ywtc-layout-cell">${yfmFragmentToHtml(cell, warnings, normalizations)}</div>`).join('');
    return `<section class="ywtc-layout" data-ywtc-layout-source="yandex-wiki"><section class="ywtc-layout-section ywtc-layout-columns-${segment.cells.length} ywtc-layout-gap-${gap}" data-ywtc-layout-type="${segment.cells.length === 1 ? 'single' : segment.cells.length === 2 ? 'two_equal' : segment.cells.length === 3 ? 'three_equal' : 'unsupported'}">${cells}</section></section>`;
  }).join('');
}

function metrics(html: string): NormalizedDocument['metrics'] {
  const $ = load(html, null, false);
  return {links: $('a').length, images: $('img').length, tables: $('table').length, codeBlocks: $('pre').length, preservedExternalReferences: 0};
}

function normalizedNodesFromHtml(html: string, provider: SourcePage['provider']): NormalizedNode[] {
  const $ = load(`<main data-ywtc-nodes>${html}</main>`, null, false);
  const nodes: NormalizedNode[] = [];
  let pending = '';
  const flush = (): void => {
    if (!pending) return;
    nodes.push({type: 'html', value: pending});
    pending = '';
  };
  for (const element of $('main[data-ywtc-nodes]').contents().toArray()) {
    const item = $(element);
    if (!item.is('section.ywtc-layout')) {
      pending += $.html(element);
      continue;
    }
    flush();
    const sections = item.children('section.ywtc-layout-section').toArray().map<NormalizedNode>((section) => {
      const sectionItem = $(section);
      const rawType = sectionItem.attr('data-ywtc-layout-type') ?? 'unsupported';
      const sectionType: Exclude<NonNullable<NormalizedNode['layout']>['sectionType'], undefined> = confluenceLayoutCellCounts.has(rawType) || rawType === 'unsupported'
        ? rawType as Exclude<NonNullable<NormalizedNode['layout']>['sectionType'], undefined>
        : 'unsupported';
      const gap = String(sectionItem.attr('class') ?? '').split(/\s+/).find((value) => value.startsWith('ywtc-layout-gap-'))?.slice('ywtc-layout-gap-'.length);
      const cells = sectionItem.children('.ywtc-layout-cell').toArray().map<NormalizedNode>((cell) => ({
        type: 'layout-cell',
        children: [{type: 'html', value: $(cell).html() ?? ''}],
      }));
      return {type: 'layout-section', layout: {source: provider, sectionType, ...(gap ? {gap} : {})}, children: cells};
    });
    nodes.push({type: 'layout', layout: {source: provider}, children: sections});
  }
  flush();
  return nodes.length > 0 ? nodes : [{type: 'html', value: '<p></p>'}];
}

function semanticallyEmptyHtml(html: string): boolean {
  const $ = load(html, null, false);
  $('script,style').remove();
  if (semanticText($.root().text())) return false;
  return $('a[href],a[name],[id],img,video,audio,table,pre,code,hr,blockquote,ul,ol,.ywtc-note,.ywtc-expand,.ywtc-children,.ywtc-task-list,.ywtc-fallback').length === 0;
}

export function normalizePageContent(page: SourcePage): NormalizedDocument {
  const warnings: string[] = [];
  const normalizations: string[] = [];
  const adaptations: string[] = [];
  const tree = page.rawFormat === 'yfm' ? extractTreeDirectives(page.rawContent) : {content: page.rawContent, directives: []};
  const html = page.rawFormat === 'yfm' ? yfmToHtml(tree.content, warnings, normalizations) : storageToSemanticHtml(page.rawContent, warnings, adaptations);
  const references = extractPageReferences(page.rawContent, page.rawFormat).map<NormalizedReference>((reference, index) => ({
    token: `ref-${index}`,
    kind: reference.kind,
    raw: reference.raw,
    ...(reference.href ? {href: reference.href} : {}),
    label: reference.pageTitle ?? reference.href ?? reference.raw,
    ...(reference.anchor ? {anchor: reference.anchor} : {}),
  }));
  const children: NormalizedNode[] = normalizedNodesFromHtml(html, page.provider);
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
    ...(page.contentAvailability?.status === 'provider-unavailable' ? {
      sourceContentUnavailable: {
        sourceType: page.contentAvailability.sourceType,
        sourceUrl: page.url,
        reason: page.contentAvailability.reason,
      },
    } : {}),
    references,
    warnings,
    normalizations,
    adaptations,
    notices: transformationNotices({normalizations, adaptations, degradations: warnings}),
    degraded: warnings.length > 0,
    semanticallyEmpty: tree.directives.length === 0 && semanticallyEmptyHtml(html),
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
  const gridResources = resources.filter((resource) => resource.kind === 'grid');
  const grids = gridResources.filter((resource) => resource.metadata?.grid && !resource.inventoryFailure);
  const failedGrids = gridResources.filter((resource) => resource.inventoryFailure);
  if (gridResources.length === 0) {
    if (!document.sourceContentUnavailable) return document;
    const warning = `Yandex Wiki ${document.sourceContentUnavailable.sourceType} content is unavailable through the provider API; the original page link was preserved`;
    const fallbackHtml = `<aside class="ywtc-fallback"><p>${escapeHtml(warning)}.</p><p><a data-ywtc-source-fallback="true" href="${escapeHtml(document.sourceContentUnavailable.sourceUrl)}">Open original page</a></p></aside>`;
    const htmlNode = document.root.children?.find((node) => node.type === 'html');
    if (htmlNode) htmlNode.value = fallbackHtml;
    else document.root.children?.push({type: 'html', value: fallbackHtml});
    const warnings = [...document.warnings, warning];
    return {
      ...document,
      raw: `> ${warning}.\n>\n> [Open original page](${document.sourceContentUnavailable.sourceUrl})\n`,
      warnings,
      notices: transformationNotices({normalizations: document.normalizations, adaptations: document.adaptations, degradations: warnings}),
      degraded: true,
      semanticallyEmpty: false,
      metrics: {...document.metrics, links: document.metrics.links + 1},
    };
  }
  const tablesHtml = grids.map((resource) => {
    const grid = resource.metadata?.grid as {title?: string; structure?: {columns?: Array<{title?: string}>}; rows?: Array<{row?: unknown[]}>} | undefined;
    const columns = grid?.structure?.columns ?? [];
    const rows = grid?.rows ?? [];
    return `<section class="ywtc-grid"><h2>${escapeHtml(grid?.title ?? resource.name)}</h2><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title ?? '')}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((_column, index) => `<td>${escapeHtml(gridCell(row.row?.[index]))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  }).join('');
  const fallbackWarnings = failedGrids.map((resource) => `Dynamic table "${resource.name}" could not be read from the provider API; the original page link was preserved`);
  const fallbackHtml = failedGrids.map((resource, index) => {
    const message = fallbackWarnings[index]!;
    const sourceUrl = resource.sourceUrl ?? document.sourceContentUnavailable?.sourceUrl;
    return `<aside class="ywtc-fallback" data-ywtc-resource-id="${escapeHtml(resource.id)}"><p>${escapeHtml(message)}.</p>${sourceUrl ? `<p><a data-ywtc-source-fallback="true" href="${escapeHtml(sourceUrl)}">Open original page</a></p>` : ''}</aside>`;
  }).join('');
  const html = `${tablesHtml}${fallbackHtml}`;
  const htmlNode = document.root.children?.find((node) => node.type === 'html');
  if (htmlNode) htmlNode.value = `${htmlNode.value ?? ''}${html}`;
  else document.root.children?.push({type: 'html', value: html});
  const adaptations = [...document.adaptations, ...grids.map((resource) => `Dynamic table "${resource.name}" was converted to a static table`)];
  const warnings = [...document.warnings, ...fallbackWarnings];
  const {sourceContentUnavailable: _resolvedSourceContent, ...resolvedDocument} = document;
  return {
    ...resolvedDocument,
    ...(failedGrids.length > 0 && document.raw.length === 0
      ? {raw: failedGrids.map((resource, index) => `> ${fallbackWarnings[index]}.\n>\n> [Open original page](${resource.sourceUrl ?? ''})`).join('\n\n')}
      : {}),
    warnings,
    adaptations,
    notices: transformationNotices({normalizations: document.normalizations, adaptations, degradations: warnings}),
    degraded: warnings.length > 0,
    semanticallyEmpty: false,
    metrics: {
      ...document.metrics,
      links: document.metrics.links + failedGrids.filter((resource) => resource.sourceUrl ?? document.sourceContentUnavailable?.sourceUrl).length,
      tables: document.metrics.tables + grids.length,
    },
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

function linearizeLayoutsForMarkdown(html: string): {html: string; layouts: number} {
  const $ = load(html, null, false);
  let layouts = 0;
  $('section.ywtc-layout').toArray().reverse().forEach((layout) => {
    const sourceSections = $(layout).children('section.ywtc-layout-section').toArray();
    if (sourceSections.some((section) => $(section).children('.ywtc-layout-cell').length > 1)) layouts += 1;
    const sections = sourceSections.map((section) => {
      const cells = $(section).children('.ywtc-layout-cell').toArray();
      if (cells.length <= 1) return cells.map((cell) => $(cell).html() ?? '').join('');
      return cells.map((cell, index) => `<section class="ywtc-layout-linear-cell"><h3>Column ${index + 1}</h3>${$(cell).html() ?? ''}</section>`).join('');
    }).join('');
    $(layout).replaceWith(sections);
  });
  return {html: $.html(), layouts};
}

interface YfmSemanticResult {
  body: string;
  adaptations: string[];
}

async function semanticHtmlToYfm(html: string): Promise<YfmSemanticResult> {
  const adaptations = new Set<string>();
  let tokenSequence = 0;
  const convert = async (fragment: string): Promise<string> => {
    const $ = load(fragment, null, false);
    const tokens = new Map<string, string>();
    const selector = 'section.ywtc-layout,details.ywtc-expand,aside.ywtc-note,nav.ywtc-children,ul.ywtc-task-list,span.ywtc-anchor';
    const elements = $(selector).filter((_index, element) => $(element).parents(selector).length === 0).toArray().reverse();
    for (const element of elements) {
      const item = $(element);
      let rendered = '';
      if (item.is('section.ywtc-layout')) {
        const sections: string[] = [];
        for (const section of item.children('section.ywtc-layout-section').toArray()) {
          const sectionItem = $(section);
          const sectionType = sectionItem.attr('data-ywtc-layout-type') ?? 'unsupported';
          if (['two_left_sidebar', 'two_right_sidebar', 'three_with_sidebars', 'unsupported'].includes(sectionType)) {
            adaptations.add(`Confluence ${sectionType} layout widths were converted to equal YFM columns`);
          }
          const blocks: string[] = [];
          for (const cell of sectionItem.children('.ywtc-layout-cell').toArray()) {
            const body = (await convert($(cell).html() ?? '')).trim();
            blocks.push(`{% block %}\n\n${body}\n\n{% endblock %}`);
          }
          sections.push(`{% layout %}\n\n${blocks.join('\n\n')}\n\n{% endlayout %}`);
        }
        rendered = sections.join('\n\n');
      } else if (item.is('details.ywtc-expand')) {
        const title = item.attr('data-ywtc-title') ?? (item.children('summary').first().text().trim() || 'Details');
        const clone = item.clone();
        clone.children('summary').first().remove();
        rendered = `{% cut "${title.replaceAll('"', '\\"')}" %}\n\n${(await convert(clone.html() ?? '')).trim()}\n\n{% endcut %}`;
      } else if (item.is('aside.ywtc-note')) {
        const rawType = item.attr('data-ywtc-note-type') ?? 'info';
        const type = rawType === 'note' ? 'info' : rawType;
        const title = item.attr('data-ywtc-title')?.trim();
        rendered = `{% note ${type}${title ? ` "${title.replaceAll('"', '\\"')}"` : ''} %}\n\n${(await convert(item.html() ?? '')).trim()}\n\n{% endnote %}`;
      } else if (item.is('nav.ywtc-children')) {
        const depth = item.attr('data-ywtc-depth');
        const sort = item.attr('data-ywtc-sort');
        const reverse = item.attr('data-ywtc-reverse') === 'true';
        const attributes = [
          depth ? `depth="${depth}"` : '',
          sort === 'title' ? 'sort_by="title"' : '',
          sort === 'title' ? `sort="${reverse ? 'desc' : 'asc'}"` : '',
        ].filter(Boolean).join(' ');
        rendered = `{% tree${attributes ? ` ${attributes}` : ''} %}`;
      } else if (item.is('ul.ywtc-task-list')) {
        const tasks: string[] = [];
        for (const task of item.children('li.ywtc-task').toArray()) {
          const marker = $(task).attr('data-ywtc-task-status') === 'complete' ? 'x' : ' ';
          const body = (await convert($(task).html() ?? '')).trim().replace(/\n/g, '\n  ');
          tasks.push(`- [${marker}] ${body}`);
        }
        rendered = tasks.join('\n');
      } else if (item.is('span.ywtc-anchor')) {
        const id = item.attr('id');
        rendered = id ? `<a id="${escapeHtml(id)}"></a>` : '';
      }
      const token = `YWTCBLOCKTOKEN${tokenSequence++}END`;
      tokens.set(token, rendered);
      item.replaceWith(`<p>${token}</p>`);
    }
    let markdown = await htmlToMarkdown($.html());
    for (const [token, rendered] of tokens) markdown = markdown.replaceAll(token, rendered);
    return markdown.trim();
  };
  return {body: `${await convert(html)}\n`, adaptations: [...adaptations]};
}

async function sanitizeHtml(html: string): Promise<string> {
  const parsed = load(html, null, false);
  parsed('[class]').each((_index, element) => {
    const safeClasses = String(parsed(element).attr('class') ?? '').split(/\s+/).filter((value) => /^ywtc-[\w-]+$/.test(value));
    if (safeClasses.length > 0) parsed(element).attr('class', safeClasses.join(' '));
    else parsed(element).removeAttr('class');
  });
  const schema: SanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'aside', 'details', 'summary'],
    attributes: {
      ...defaultSchema.attributes,
      '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
      section: [...(defaultSchema.attributes?.section ?? []).filter((attribute) => !(Array.isArray(attribute) && attribute[0] === 'className')), 'className'],
    },
  };
  const result = await unified().use(rehypeParse, {fragment: true}).use(rehypeSanitize, schema).use(rehypeStringify).process(parsed.html());
  return String(result);
}

function normalizedNodeHtml(node: NormalizedNode): string {
  if (node.type === 'html') return node.value ?? '';
  if (node.type === 'layout-cell') return `<div class="ywtc-layout-cell">${(node.children ?? []).map(normalizedNodeHtml).join('')}</div>`;
  if (node.type === 'layout-section') {
    const cells = node.children ?? [];
    const type = node.layout?.sectionType ?? 'unsupported';
    const gap = node.layout?.gap ? ` ywtc-layout-gap-${node.layout.gap.replace(/[^a-z0-9_-]/gi, '')}` : '';
    return `<section class="ywtc-layout-section ywtc-layout-${type} ywtc-layout-columns-${cells.length}${gap}" data-ywtc-layout-type="${type}">${cells.map(normalizedNodeHtml).join('')}</section>`;
  }
  if (node.type === 'layout') {
    return `<section class="ywtc-layout" data-ywtc-layout-source="${node.layout?.source ?? 'yandex-wiki'}">${(node.children ?? []).map(normalizedNodeHtml).join('')}</section>`;
  }
  return '';
}

function htmlFromDocument(document: NormalizedDocument): string {
  const html = document.root.children?.map(normalizedNodeHtml).join('') ?? '';
  return html || '<p></p>';
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
  if (!page.rawContent.trim()) {
    const normalizations = ['Preserved an intentionally empty source page'];
    return {
      body: provider === 'confluence' ? '<p></p>' : '',
      warnings: [],
      normalizations,
      adaptations: [],
      notices: transformationNotices({normalizations}),
      degraded: false,
      representedReferences: page.references.length,
      preservedExternalReferences: 0,
    };
  }
  if (provider === 'confluence') {
    const raw = page.rawContent
      ? `<pre><code>${escapeHtml(page.rawContent)}</code></pre>`
      : '<p><em>The source page has no body content.</em></p>';
    return {
      body: `<p><strong>Source content fallback</strong> · <a href="${escapeHtml(page.url)}">original page</a></p>${raw}`,
      warnings: [warning],
      normalizations: [],
      adaptations: [],
      notices: transformationNotices({degradations: [warning]}),
      degraded: true,
      representedReferences: page.references.length,
      preservedExternalReferences: 0,
    };
  }
  const raw = page.rawContent
    ? `${markdownFence(page.rawContent)}text\n${page.rawContent}\n${markdownFence(page.rawContent)}`
    : '_The source page has no body content._';
  return {
    body: `**Source content fallback** · [original page](${page.url})\n\n${raw}\n`,
    warnings: [warning],
    normalizations: [],
    adaptations: [],
    notices: transformationNotices({degradations: [warning]}),
    degraded: true,
    representedReferences: page.references.length,
    preservedExternalReferences: 0,
  };
}

export async function renderWithSafeStructuralFallback(input: {
  document: NormalizedDocument;
  page: SourcePage;
  context: RenderContext;
  provider: SourcePage['provider'];
  preferred: () => Promise<RenderedDocument>;
}): Promise<RenderedDocument> {
  let reason: string;
  try {
    const rendered = await input.preferred();
    if (rendered.body.trim() || input.document.semanticallyEmpty) return rendered;
    reason = emptyRendererFallbackReason(input.document);
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }

  try {
    const structural = input.provider === 'confluence'
      ? await renderStaticHtml(input.document, input.context)
      : await renderMarkdown(input.document, input.context);
    if (structural.body.trim()) {
      const adaptation = `Preferred provider rendering was unavailable; a safe structural renderer preserved the normalized content (${reason})`;
      const adaptations = [...new Set([...structural.adaptations, adaptation])];
      return {
        ...structural,
        adaptations,
        notices: transformationNotices({
          normalizations: structural.normalizations,
          adaptations,
          degradations: structural.warnings,
        }),
      };
    }
  } catch (error) {
    const structuralReason = error instanceof Error ? error.message : String(error);
    reason = `${reason}; safe structural renderer failed: ${structuralReason}`;
  }

  return rawContentFallback(input.page, input.provider, reason);
}

export function emptyRendererFallbackReason(document: NormalizedDocument): string {
  const types = new Set<string>();
  const visit = (node: NormalizedNode): void => {
    if (!['document', 'html'].includes(node.type)) types.add(node.type);
    for (const child of node.children ?? []) visit(child);
  };
  visit(document.root);
  return types.size > 0
    ? `renderer returned an empty body for normalized ${[...types].sort().join(', ')} content`
    : `renderer returned an empty body for non-empty ${document.rawFormat} content`;
}

function semanticText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\{(?:gray|grey|red|green|blue|orange|yellow|purple|black|white)\}(?:\s|&#x20;)*/gi, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const semanticBlockSelector = [
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
].join(',');

interface SemanticContent {
  text: string;
  headings: string[];
  listItems: string[];
  tableCells: string[];
  code: string[];
  links: string[];
  anchorLinks: string[];
  images: string[];
  imageLabels: string[];
  imageAttributes: string[];
  anchors: string[];
  structure: {lists: number; rows: number; details: number; asides: number; codeBlocks: number};
  macros: string[];
  layouts: string[];
}

function semanticContent(body: string, provider: SourcePage['provider']): SemanticContent {
  const html = renderedPreviewHtml(body, provider);
  const $ = load(html, null, false);
  $('script,style').remove();
  type SemanticSelection = ReturnType<typeof $>;
  const blockText = (selection: SemanticSelection): string => {
    const root = selection.clone();
    root.find('br').replaceWith(' ');
    root.find(semanticBlockSelector).each((_index, block) => {
      $(block).before(' ').after(' ');
    });
    return semanticText(root.text());
  };
  $('h1,h2,h3,h4,h5,h6,p,div,span').each((_index, element) => {
    const node = $(element);
    if (!semanticText(node.text()) && node.find('img,table,pre,code,a[href],[id],a[name]').length === 0 && !node.is('[id],a[name]')) node.remove();
  });
  const meaningful = (element: Parameters<typeof $>[0]): boolean => {
    const item = $(element);
    return Boolean(semanticText(item.text())) || item.find('img,a[href],table,pre,code,[id],a[name]').length > 0;
  };
  const textValues = (selector: string): string[] => $(selector).toArray()
    .map((element) => blockText($(element)))
    .filter(Boolean);
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
  const layouts = $('.ywtc-layout').toArray().flatMap((layout, layoutIndex) => $(layout).children('.ywtc-layout-section').toArray().flatMap((section, sectionIndex) => {
    const item = $(section);
    const cells = item.children('.ywtc-layout-cell').toArray().map((cell) => {
      const value = $(cell);
      const signature = [
        blockText(value),
        `links=${value.find('a[href]').length}`,
        `images=${value.find('img').length}`,
        `tables=${value.find('table').length}`,
        `code=${value.find('pre,code').length}`,
        `anchors=${value.find('[id],a[name]').length}`,
      ].join('|');
      return signature === '|links=0|images=0|tables=0|code=0|anchors=0' ? '' : signature;
    });
    if (cells.every((cell) => !cell)) return [];
    return [`${layoutIndex}:${sectionIndex}:${item.attr('data-ywtc-layout-type') ?? 'unsupported'}:${cells.join('::')}`];
  }));
  const links = $('a[href]').toArray().map((element) => ({
    href: $(element).attr('href') ?? '',
    label: blockText($(element)),
  }));
  const meaningfulRows = $('tr').toArray().filter((row) => $(row).children('th,td').toArray().some((cell) => meaningful(cell)));
  const meaningfulLists = $('ul,ol').toArray().filter((list) => $(list).find('li').toArray().some((item) => meaningful(item)));
  const meaningfulDetails = $('details').toArray().filter((item) => meaningful(item));
  const meaningfulAsides = $('aside').toArray().filter((item) => meaningful(item));
  return {
    text: blockText($.root()),
    headings: $('h1,h2,h3,h4,h5,h6').toArray()
      .map((element) => `${element.tagName}:${blockText($(element))}`)
      .filter((value) => !/:$/.test(value)),
    listItems: $('li').toArray().filter((element) => meaningful(element)).map((element) => blockText($(element))),
    tableCells: $('th,td').toArray().filter((element) => meaningful(element)).map((element) => `${element.tagName}:${blockText($(element))}`),
    code: [...textValues('pre'), ...$('code').toArray().filter((element) => $(element).parents('pre').length === 0).map((element) => blockText($(element))).filter(Boolean)],
    links: links.filter(({href}) => !href.startsWith('#')).map(({href, label}) => `${href}|${label}`).sort(),
    anchorLinks: links.filter(({href, label}) => href.startsWith('#') && Boolean(label)).map(({label}) => label).sort(),
    images: $('img').toArray().map((element) => $(element).attr('src') ?? '').sort(),
    imageLabels: $('img').toArray().map((element) => semanticText($(element).attr('alt') ?? '')).filter(Boolean).sort(),
    imageAttributes: $('img').toArray().map((element) => [
      $(element).attr('src') ?? '',
      $(element).attr('width') ?? '',
      $(element).attr('height') ?? '',
    ].join('|')).sort(),
    anchors: $('a[name],a[id],.ywtc-anchor').toArray().map((element) => $(element).attr('id') ?? $(element).attr('name') ?? '').filter(Boolean).sort(),
    structure: {
      lists: meaningfulLists.length,
      rows: meaningfulRows.length,
      details: meaningfulDetails.length,
      asides: meaningfulAsides.length,
      codeBlocks: $('pre').length,
    },
    macros: macroNames.sort(),
    layouts,
  };
}

function semanticContentIsEmpty(content: SemanticContent): boolean {
  return !content.text
    && content.headings.length === 0
    && content.listItems.length === 0
    && content.tableCells.length === 0
    && content.code.length === 0
    && content.links.length === 0
    && content.anchorLinks.length === 0
    && content.images.length === 0
    && content.imageAttributes.length === 0
    && content.anchors.length === 0
    && content.macros.length === 0
    && content.layouts.length === 0
    && Object.values(content.structure).every((count) => count === 0);
}

export function semanticContentFingerprint(body: string, provider: SourcePage['provider']): string {
  return sha256(JSON.stringify(semanticContent(body, provider)));
}

export interface ContentVerificationResult {
  status: 'complete' | 'partial' | 'failed';
  differences: string[];
  adaptations: string[];
}

export class DestinationContentVerificationError extends Error {
  constructor(readonly result: ContentVerificationResult) {
    super(result.differences.join('; '));
    this.name = 'DestinationContentVerificationError';
  }
}

export function verifyDestinationContent(
  expectedBody: string,
  actualBody: string | undefined,
  provider: SourcePage['provider'],
  page: SourcePage,
): ContentVerificationResult {
  if (actualBody === undefined) return {status: 'failed', differences: [`Verification could not read destination content for ${page.title}`], adaptations: []};
  if (isLegacyTransferPlaceholder(actualBody, provider, page)) {
    return {status: 'failed', differences: [`Verification found a transfer placeholder instead of source content for ${page.title}`], adaptations: []};
  }
  const expected = semanticContent(expectedBody, provider);
  const actual = semanticContent(actualBody, provider);
  const expectedEmpty = semanticContentIsEmpty(expected);
  const actualEmpty = semanticContentIsEmpty(actual);
  if (expectedEmpty && actualEmpty) return {status: 'complete', differences: [], adaptations: []};
  if (!expectedEmpty && actualEmpty) return {status: 'failed', differences: [`Verification found empty destination content for ${page.title}`], adaptations: []};
  if (expectedEmpty && !actualEmpty) {
    return {status: 'failed', differences: [`Verification found unexpected destination content for semantically empty source page ${page.title}`], adaptations: []};
  }
  const containsMultiset = (actualValues: readonly string[], expectedValues: readonly string[]): boolean => {
    const counts = new Map<string, number>();
    for (const value of actualValues) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const value of expectedValues) {
      const remaining = counts.get(value) ?? 0;
      if (remaining === 0) return false;
      counts.set(value, remaining - 1);
    }
    return true;
  };
  const structureContains = Object.entries(expected.structure).every(([key, count]) => actual.structure[key as keyof SemanticContent['structure']] >= count);
  const textPreserved = expected.text === actual.text;
  const missingData = [
    ...(!textPreserved ? ['text'] : []),
    ...(!containsMultiset(actual.tableCells, expected.tableCells) ? ['tableCells'] : []),
    ...(!containsMultiset(actual.code, expected.code) ? ['code'] : []),
    ...(!containsMultiset(actual.links, expected.links) ? ['links'] : []),
    ...(!containsMultiset(actual.anchorLinks, expected.anchorLinks) ? ['anchorLinks'] : []),
    ...(!containsMultiset(actual.images, expected.images) ? ['images'] : []),
    ...(!containsMultiset(actual.anchors, expected.anchors) ? ['anchors'] : []),
    ...(!containsMultiset(actual.macros, expected.macros) ? ['macros'] : []),
  ];
  if (missingData.length > 0) {
    return {
      status: 'failed',
      differences: [`Verification found destination content that differs from the rendered source for ${page.title}: ${missingData.join(', ')}`],
      adaptations: [],
    };
  }
  const labelsPreserved = expected.imageLabels.every((label) => (
    actual.imageLabels.includes(label) || actual.text.includes(`Image description: ${label}`)
  ));
  const missingStructure = [
    ...(!containsMultiset(actual.headings, expected.headings) ? ['headings'] : []),
    ...(!containsMultiset(actual.listItems, expected.listItems) ? ['listItems'] : []),
    ...(!labelsPreserved ? ['imageLabels'] : []),
    ...(!containsMultiset(actual.imageAttributes, expected.imageAttributes) ? ['imageAttributes'] : []),
    ...(!structureContains ? ['structure'] : []),
  ];
  if (missingStructure.length > 0) {
    return {
      status: 'partial',
      differences: [`Destination lost or could not verify meaningful structure for ${page.title}: ${missingStructure.join(', ')}`],
      adaptations: [],
    };
  }
  if (!containsMultiset(actual.layouts, expected.layouts)) return {status: 'complete', differences: [], adaptations: [`Destination adapted visual layout geometry for ${page.title} while preserving its payload`]};
  return {status: 'complete', differences: [], adaptations: []};
}

export function assertDestinationContent(
  expectedBody: string,
  actualBody: string | undefined,
  provider: SourcePage['provider'],
  page: SourcePage,
): ContentVerificationResult {
  const result = verifyDestinationContent(expectedBody, actualBody, provider, page);
  if (result.status === 'failed') throw new DestinationContentVerificationError(result);
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
    if ($(element).attr('data-ywtc-source-fallback') === 'true') return;
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

function preservedExternalImageCount(document: NormalizedDocument, context: RenderContext): number {
  const $ = load(htmlFromDocument(document), null, false);
  return $('img[src]').toArray().filter((element) => {
    const source = $(element).attr('src') ?? '';
    return /^https?:\/\//i.test(source) && !resourceBinding(source, context);
  }).length;
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
  if (document.semanticallyEmpty) {
    return {body: '', warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations: [...document.adaptations], notices: [...document.notices], degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: 0};
  }
  const portable = rewritePortableHtml(htmlFromDocument(document), context);
  const linearized = linearizeLayoutsForMarkdown(portable);
  const tree = treeDirectiveNodes(document).map((node) => renderTreeMarkdown(context, node.tree ?? {})).filter(Boolean).join('\n\n');
  const content = await htmlToMarkdown(linearized.html);
  const body = tree ? `${content.trimEnd()}\n\n${tree}\n` : content;
  const layoutAdaptations = linearized.layouts > 0 ? [`${linearized.layouts} column layout${linearized.layouts === 1 ? ' was' : 's were'} linearized for portable Markdown`] : [];
  const adaptations = [...document.adaptations, ...layoutAdaptations];
  return {body, warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations, notices: transformationNotices({normalizations: document.normalizations, adaptations, degradations: document.warnings}), degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: preservedExternalImageCount(document, context)};
}

export async function renderStaticHtml(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  if (document.semanticallyEmpty) {
    return {body: '', warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations: [...document.adaptations], notices: [...document.notices], degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: 0};
  }
  const rewritten = rewritePortableHtml(htmlFromDocument(document), context);
  const content = await sanitizeHtml(rewritten);
  const tree = treeDirectiveNodes(document).map((node) => renderTreeHtml(context, node.tree ?? {})).filter(Boolean).join('');
  const body = `${content}${tree}`;
  const unsupportedLayouts: number[] = [];
  const visit = (node: NormalizedNode): void => {
    if (node.type === 'layout-section' && node.layout?.sectionType === 'unsupported') unsupportedLayouts.push(node.children?.length ?? 0);
    for (const child of node.children ?? []) visit(child);
  };
  visit(document.root);
  const layoutAdaptations = unsupportedLayouts.map((cells) => `Unsupported ${cells}-cell layout was stacked in static HTML without losing cell content`);
  const adaptations = [...document.adaptations, ...layoutAdaptations];
  return {body, warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations, notices: transformationNotices({normalizations: document.normalizations, adaptations, degradations: document.warnings}), degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: preservedExternalImageCount(document, context)};
}

export async function renderYfm(document: NormalizedDocument, context: RenderContext): Promise<RenderedDocument> {
  if (document.semanticallyEmpty) {
    return {body: '', warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations: [...document.adaptations], notices: [...document.notices], degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: 0};
  }
  if (document.sourceContentUnavailable) {
    return {
      body: document.raw,
      warnings: [...document.warnings],
      normalizations: [...document.normalizations],
      adaptations: [...document.adaptations],
      notices: [...document.notices],
      degraded: true,
      representedReferences: document.references.length,
      preservedExternalReferences: 0,
    };
  }
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
      warnings: [...resourceWarnings],
      normalizations: [...document.normalizations],
      adaptations: [...document.adaptations],
      notices: transformationNotices({normalizations: document.normalizations, adaptations: document.adaptations, degradations: [...resourceWarnings]}),
      degraded: resourceWarnings.size > 0,
      representedReferences: document.references.length,
      preservedExternalReferences: preservedExternalImageCount(document, context),
    };
  }
  const converted = await semanticHtmlToYfm(rewritePortableHtml(htmlFromDocument(document), context));
  return {
    body: converted.body,
    warnings: [...document.warnings],
    normalizations: [...document.normalizations, 'Converted supported Confluence Storage Format constructs to native YFM equivalents'],
    adaptations: [...document.adaptations, ...converted.adaptations],
    notices: transformationNotices({normalizations: [...document.normalizations, 'Converted supported Confluence Storage Format constructs to native YFM equivalents'], adaptations: [...document.adaptations, ...converted.adaptations], degradations: document.warnings}),
    degraded: document.degraded,
    representedReferences: document.references.length,
    preservedExternalReferences: preservedExternalImageCount(document, context),
  };
}

export async function renderConfluenceStorage(document: NormalizedDocument, page: SourcePage, context: RenderContext, spaceKey: string): Promise<RenderedDocument> {
  if (document.semanticallyEmpty) {
    return {body: '<p></p>', warnings: [...document.warnings], normalizations: [...document.normalizations], adaptations: [...document.adaptations], notices: [...document.notices], degraded: document.degraded, representedReferences: document.references.length, preservedExternalReferences: 0};
  }
  if (document.sourceContentUnavailable) {
    const $ = load(htmlFromDocument(document), null, false);
    $('aside.ywtc-fallback').each((_index, element) => {
      $(element).replaceWith(`<blockquote>${$(element).html() ?? ''}</blockquote>`);
    });
    return {
      body: $.html(),
      warnings: [...document.warnings],
      normalizations: [...document.normalizations],
      adaptations: [...document.adaptations],
      notices: [...document.notices],
      degraded: true,
      representedReferences: document.references.length,
      preservedExternalReferences: 0,
    };
  }
  if (document.rawFormat === 'confluence-storage') {
    const $ = load(`<main data-root>${document.raw}</main>`, {xmlMode: true}, false);
    const warnings: string[] = [];
    const adaptations = [...document.adaptations];
    $('script, iframe, object, embed, form').each((_index, element) => {
      const raw = $.html(element);
      warnings.push(`Active or embedded element <${element.tagName}> was preserved as inert source text`);
      $(element).replaceWith(`<pre><code>${escapeHtml(raw)}</code></pre>`);
    });
    $('ac\\:image').each((_index, element) => {
      const image = $(element);
      const attachment = image.children('ri\\:attachment');
      const filename = attachment.attr('ri:filename');
      if (!filename) return;
      const binding = resourceBinding(filename, context);
      if (!binding) return;
      if (binding.kind === 'uploaded') {
        attachment.attr('ri:filename', binding.resource.name);
        const alternative = meaningfulImageAlternative(image.attr('ac:alt'), binding.resource.name);
        if (alternative && !image.next().text().includes(`Image description: ${alternative}`)) {
          image.after(`<p><em>Image description: ${escapeHtml(alternative)}</em></p>`);
          adaptations.push('Attachment image alternative text was preserved as a readable caption for destination compatibility');
        }
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
        const rewritten = $(element)
          .attr('ri:content-title', destination.title)
          .attr('ri:space-key', destinationSpace ?? spaceKey);
        if ('provider' in destination) rewritten.attr('ri:content-id', destination.id);
        else rewritten.removeAttr('ri:content-id');
      }
    });
    return {
      body: $('main[data-root]').html() ?? '<p></p>',
      warnings,
      normalizations: [...document.normalizations],
      adaptations,
      notices: transformationNotices({normalizations: document.normalizations, adaptations, degradations: warnings}),
      degraded: warnings.length > 0,
      representedReferences: document.references.length,
      preservedExternalReferences: preservedExternalImageCount(document, context),
    };
  }
  const pagesBySlug = new Map<string, {sourceId: number; slug: string; destinationTitle: string; destinationId?: string}>();
  for (const source of context.sourcePages.values()) {
    const destination = context.pages.get(source.canonicalId);
    if (!destination || !('title' in destination)) continue;
    const numericId = Number(source.id);
    pagesBySlug.set(normalizeWikiSlug(source.locator).toLocaleLowerCase(), {
      sourceId: Number.isFinite(numericId) ? numericId : 0,
      slug: source.locator,
      destinationTitle: destination.title,
      ...('provider' in destination ? {destinationId: destination.id} : {}),
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
  const gridFallbackStorage = $('aside.ywtc-fallback[data-ywtc-resource-id]').toArray()
    .map((element) => `<blockquote>${$(element).html() ?? ''}</blockquote>`)
    .join('');
  return {
    body: `${normalizedStorage('main[data-root]').html() ?? '<p></p>'}${treeStorage}${gridStorage}${gridFallbackStorage}`,
    warnings: [...document.warnings, ...conversionWarnings],
    normalizations,
    adaptations: [...document.adaptations, ...converted.adaptations],
    notices: transformationNotices({normalizations, adaptations: [...document.adaptations, ...converted.adaptations], degradations: [...document.warnings, ...conversionWarnings]}),
    degraded: document.degraded || conversionWarnings.length > 0,
    representedReferences: document.references.length,
    preservedExternalReferences: converted.stats.preservedExternalReferences,
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
