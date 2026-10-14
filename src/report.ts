import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
import type {ConversionStats} from './conversion.js';
import type {StateLoadSource} from './state.js';
import type {MigrationPlanSummary} from './types.js';

export type ReportPageStatus = 'planned' | 'created' | 'updated' | 'failed' | 'skipped';
export type ReportAttachmentStatus = 'planned' | 'uploaded' | 'reused' | 'failed' | 'skipped';
export type ReportPreviewProvenance = 'yandex-rendered' | 'confluence-view' | 'storage-fallback' | 'unavailable';

export interface ReportAttachment {
  sourceId: number;
  sourceName: string;
  destinationName: string;
  size: number;
  status: ReportAttachmentStatus;
  error?: string;
}

export interface ReportPage {
  sourceId: number;
  sourceSlug: string;
  sourceTitle: string;
  sourceUrl?: string;
  parentSourceId?: number;
  depth: number;
  destinationId?: string;
  destinationTitle: string;
  destinationUrl?: string;
  status: ReportPageStatus;
  attachments: number;
  attachmentBytes: number;
  attachmentItems: ReportAttachment[];
  grids: number;
  gridRows: number;
  sourceCharacters: number;
  destinationCharacters: number;
  metrics: ConversionStats;
  destinationPreviewProvenance: ReportPreviewProvenance;
  warnings: string[];
  error?: string;
}

export interface ReportPreview {
  html: string;
  baseUrl?: string;
  provenance: ReportPreviewProvenance;
}

export interface ReportPagePreviews {
  source?: ReportPreview;
  destination?: ReportPreview;
}

export interface ReportMigrationState {
  id: string;
  mode: 'automatic' | 'explicit';
  path: string;
  source: StateLoadSource;
  backupPath?: string;
}

export interface MigrationReportData {
  version: 3;
  runId: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt?: string;
  sourceRoot: string;
  sourceRootUrl?: string;
  targetPageId: string;
  targetUrl?: string;
  spaceKey: string;
  state: ReportMigrationState;
  pages: ReportPage[];
  renames: Array<{sourceId: number; sourceTitle: string; destinationTitle: string}>;
  warnings: string[];
  errors: string[];
  staleDestinationPageIds: string[];
  summary?: MigrationPlanSummary;
}

export interface MigrationReportPaths {
  directory: string;
  html: string;
  json: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function link(value: string | undefined, label: string, className = ''): string {
  const href = safeUrl(value);
  return href
    ? `<a${className ? ` class="${escapeHtml(className)}"` : ''} href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
    : `<span${className ? ` class="${escapeHtml(className)}"` : ''}>${escapeHtml(label)}</span>`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1_024 && unit < units.length - 1) {
    size /= 1_024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function duration(start: string, finish: string | undefined): string {
  if (!finish) return 'in progress';
  const milliseconds = Math.max(0, Date.parse(finish) - Date.parse(start));
  const seconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function sanitizePreviewHtml(html: string): string {
  const $ = load(`<main data-preview-root>${html}</main>`, null, false);
  $('script, iframe, object, embed, link, meta, base, form').remove();
  $('*').each((_index, element) => {
    const attributes = {...(element as {attribs?: Record<string, string>}).attribs};
    for (const [name, value] of Object.entries(attributes)) {
      if (/^on/i.test(name) || name.toLocaleLowerCase() === 'srcdoc') $(element).removeAttr(name);
      if (['href', 'src', 'action', 'poster'].includes(name.toLocaleLowerCase()) && /^\s*(?:javascript|data:text\/html):/i.test(value)) {
        $(element).removeAttr(name);
      }
    }
  });
  return $('main[data-preview-root]').html() ?? '';
}

function macroParameter($: ReturnType<typeof load>, element: unknown, name: string): string {
  return $(element as never)
    .children('ac\\:parameter')
    .filter((_index, parameter) => $(parameter).attr('ac:name') === name)
    .first()
    .text()
    .trim();
}

export function renderStoragePreview(storage: string): string {
  const $ = load(`<main data-storage-root>${storage}</main>`, {xmlMode: false}, false);

  $('ac\\:task-list').each((_index, list) => {
    const items = $(list).children('ac\\:task').toArray().map((task) => {
      const state = $(task).children('ac\\:task-status').text().trim();
      const body = $(task).children('ac\\:task-body').html() ?? '';
      return `<li class="task">${state === 'complete' ? '☑' : '☐'} <span>${body}</span></li>`;
    }).join('');
    $(list).replaceWith(`<ul class="task-list">${items}</ul>`);
  });

  const macros = $('ac\\:structured-macro').toArray().reverse();
  for (const macro of macros) {
    const element = $(macro);
    const name = element.attr('ac:name') ?? 'macro';
    const richBody = element.children('ac\\:rich-text-body').html() ?? '';
    if (name === 'anchor') {
      const anchor = macroParameter($, macro, '');
      element.replaceWith(`<span id="${escapeHtml(anchor)}" class="anchor"></span>`);
    } else if (name === 'code') {
      const language = macroParameter($, macro, 'language');
      const body = element.children('ac\\:plain-text-body').text();
      element.replaceWith(`<div class="code-label">${escapeHtml(language || 'code')}</div><pre><code>${escapeHtml(body)}</code></pre>`);
    } else if (name === 'expand') {
      const title = macroParameter($, macro, 'title') || 'Details';
      element.replaceWith(`<details open><summary>${escapeHtml(title)}</summary>${richBody}</details>`);
    } else if (['info', 'tip', 'warning', 'note'].includes(name)) {
      const title = macroParameter($, macro, 'title') || name;
      element.replaceWith(`<aside class="macro ${escapeHtml(name)}"><strong>${escapeHtml(title)}</strong>${richBody}</aside>`);
    } else {
      element.replaceWith(`<aside class="macro"><strong>${escapeHtml(name)}</strong>${richBody || '<p>Confluence macro</p>'}</aside>`);
    }
  }

  $('ac\\:image').each((_index, image) => {
    const element = $(image);
    const width = element.attr('ac:width');
    const height = element.attr('ac:height');
    const alt = element.attr('ac:alt') ?? '';
    const url = element.children('ri\\:url').attr('ri:value');
    const filename = element.children('ri\\:attachment').attr('ri:filename');
    if (safeUrl(url)) {
      element.replaceWith(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${width ? ` width="${escapeHtml(width)}"` : ''}${height ? ` height="${escapeHtml(height)}"` : ''}/>`);
    } else {
      element.replaceWith(`<figure class="attachment-placeholder">Image attachment · ${escapeHtml(filename || alt || 'unnamed')}</figure>`);
    }
  });

  $('ac\\:link').each((_index, item) => {
    const element = $(item);
    const page = element.children('ri\\:page').attr('ri:content-title');
    const attachment = element.children('ri\\:attachment').attr('ri:filename');
    const label = element.children('ac\\:link-body, ac\\:plain-text-link-body').text().trim() || page || attachment || 'Link';
    const anchor = element.attr('ac:anchor');
    element.replaceWith(`<a href="${anchor ? `#${escapeHtml(anchor)}` : '#'}">${escapeHtml(label)}</a>`);
  });

  $('ri\\:attachment').each((_index, item) => {
    const filename = $(item).attr('ri:filename') ?? 'attachment';
    $(item).replaceWith(`<span class="attachment-placeholder">Attachment · ${escapeHtml(filename)}</span>`);
  });
  $('ri\\:page').each((_index, item) => {
    const title = $(item).attr('ri:content-title') ?? 'page';
    $(item).replaceWith(`<span>${escapeHtml(title)}</span>`);
  });
  $('ac\\:parameter, ac\\:rich-text-body, ac\\:plain-text-body, ac\\:link-body, ac\\:plain-text-link-body').each((_index, item) => {
    $(item).replaceWith($(item).contents());
  });

  return sanitizePreviewHtml($('main[data-storage-root]').html() ?? '');
}

function previewDocument(preview: ReportPreview | undefined, emptyMessage: string): string {
  const html = preview?.html ? sanitizePreviewHtml(preview.html) : `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  const base = safeUrl(preview?.baseUrl);
  return `<!doctype html><html><head><meta charset="utf-8">${base ? `<base href="${escapeHtml(base)}">` : ''}<style>
    :root{color-scheme:light;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#fff}
    body{margin:0;padding:22px;overflow-wrap:anywhere}h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.2em 0 .55em}h1:first-child,h2:first-child{margin-top:0}
    a{color:#315efb}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #d8deea;padding:7px 9px;text-align:left}th{background:#f4f6fa}
    pre{overflow:auto;border-radius:8px;background:#151922;color:#f3f5fa;padding:14px}code{font-family:"SFMono-Regular",Consolas,monospace}blockquote{border-left:3px solid #8ba0ca;margin-left:0;padding-left:14px;color:#526078}
    .macro{display:block;border:1px solid #cdd8f0;border-left:4px solid #5879c7;border-radius:7px;background:#f5f8ff;padding:11px 13px;margin:12px 0}.macro.warning{border-color:#f1c26d;background:#fff9e8}.macro.tip{border-color:#70c19b;background:#effaf5}
    .macro strong{display:block;text-transform:capitalize;margin-bottom:5px}.attachment-placeholder{display:block;border:1px dashed #aab4c5;border-radius:7px;background:#f7f8fa;padding:11px;color:#5f6b7c}.task-list{list-style:none;padding-left:0}.task{display:flex;gap:8px}.code-label{font-size:11px;text-transform:uppercase;color:#6a7587;margin-bottom:4px}.empty{color:#7b8494}
  </style></head><body>${html}</body></html>`;
}

function statusLabel(status: ReportPageStatus): string {
  return {planned: 'Planned', created: 'Created', updated: 'Updated', failed: 'Failed', skipped: 'Skipped'}[status];
}

function statCard(label: string, value: string | number, detail: string): string {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function pageMetric(label: string, value: string | number): string {
  return `<span class="metric"><strong>${escapeHtml(value)}</strong> ${escapeHtml(label)}</span>`;
}

function renderList(title: string, values: string[], className: string): string {
  if (!values.length) return '';
  return `<section class="notice-list ${className}"><h2>${escapeHtml(title)} <span>${values.length}</span></h2><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>`;
}

export class MigrationReport {
  readonly data: MigrationReportData;
  private readonly previews = new Map<number, ReportPagePreviews>();

  constructor(input: Pick<MigrationReportData, 'dryRun' | 'sourceRoot' | 'targetPageId' | 'spaceKey' | 'state'> & Partial<Pick<MigrationReportData, 'sourceRootUrl' | 'targetUrl'>>) {
    const timestamp = new Date();
    this.data = {
      version: 3,
      runId: `${timestamp.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
      startedAt: timestamp.toISOString(),
      pages: [],
      renames: [],
      warnings: [],
      errors: [],
      staleDestinationPageIds: [],
      ...input,
    };
  }

  addPage(page: ReportPage, previews?: ReportPagePreviews): void {
    const index = this.data.pages.findIndex((entry) => entry.sourceId === page.sourceId);
    if (index >= 0) this.data.pages[index] = page;
    else this.data.pages.push(page);
    if (previews) this.previews.set(page.sourceId, previews);
  }

  addWarning(message: string): void {
    this.data.warnings.push(message);
  }

  addError(message: string): void {
    this.data.errors.push(message);
  }

  setSummary(summary: MigrationPlanSummary): void {
    this.data.summary = summary;
  }

  finish(): void {
    this.data.finishedAt = new Date().toISOString();
  }

  private tree(): string {
    const known = new Set(this.data.pages.map((page) => page.sourceId));
    const children = new Map<number | undefined, ReportPage[]>();
    for (const page of this.data.pages) {
      const parent = page.parentSourceId !== undefined && known.has(page.parentSourceId) ? page.parentSourceId : undefined;
      const list = children.get(parent) ?? [];
      list.push(page);
      children.set(parent, list);
    }
    const visited = new Set<number>();
    const branch = (parent: number | undefined): string => {
      const pages = children.get(parent) ?? [];
      if (!pages.length) return '';
      return `<ul>${pages.map((page) => {
        if (visited.has(page.sourceId)) return '';
        visited.add(page.sourceId);
        return `<li><a href="#page-${page.sourceId}" data-tree-status="${page.status}"><span class="status-dot ${page.status}"></span><span>${escapeHtml(page.destinationTitle)}</span><small>${escapeHtml(page.status)}</small></a>${branch(page.sourceId)}</li>`;
      }).join('')}</ul>`;
    };
    return branch(undefined);
  }

  private pageSection(page: ReportPage): string {
    const previews = this.previews.get(page.sourceId);
    const sourceDoc = previewDocument(previews?.source, 'Source preview is unavailable.');
    const destinationDoc = previewDocument(previews?.destination, 'Destination preview is unavailable.');
    const totalLinks = page.metrics.internalPageLinks + page.metrics.externalLinks + page.metrics.attachmentLinks + page.metrics.anchorLinks;
    const totalImages = page.metrics.attachedImages + page.metrics.externalImages;
    const search = [page.sourceTitle, page.destinationTitle, page.sourceSlug, page.error, ...page.warnings].filter(Boolean).join(' ').toLocaleLowerCase();
    const attachmentRows = page.attachmentItems.length
      ? `<div class="attachment-table"><table><thead><tr><th>Attachment</th><th>Destination</th><th>Size</th><th>Status</th></tr></thead><tbody>${page.attachmentItems.map((item) => `<tr><td>${escapeHtml(item.sourceName)}</td><td>${escapeHtml(item.destinationName)}</td><td>${escapeHtml(formatBytes(item.size))}</td><td><span class="pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>${item.error ? `<small>${escapeHtml(item.error)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">No attachments on this page.</p>';
    const pageWarnings = page.warnings.length
      ? `<div class="page-notices warnings"><strong>Degradations and warnings</strong><ul>${page.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>`
      : '';
    const pageError = page.error ? `<div class="page-notices errors"><strong>Migration error</strong><p>${escapeHtml(page.error)}</p></div>` : '';
    return `<details class="page-card" id="page-${page.sourceId}" data-status="${page.status}" data-search="${escapeHtml(search)}"${page.depth === 0 || page.status === 'failed' ? ' open' : ''}>
      <summary><span class="status-dot ${page.status}"></span><span class="page-heading"><strong>${escapeHtml(page.destinationTitle)}</strong><small>${escapeHtml(page.sourceSlug)}</small></span><span class="pill ${page.status}">${statusLabel(page.status)}</span></summary>
      <div class="page-body">
        <div class="page-links">${link(page.sourceUrl, 'Open in Yandex Wiki')}${page.destinationUrl ? link(page.destinationUrl, 'Open in Confluence') : '<span class="muted">No destination URL yet</span>'}</div>
        <div class="metrics">
          ${pageMetric('attachments', page.attachments)}${pageMetric('attachment bytes', formatBytes(page.attachmentBytes))}${pageMetric('links', totalLinks)}${pageMetric('images', totalImages)}${pageMetric('tables', page.metrics.tables)}${pageMetric('grids / rows', `${page.grids} / ${page.gridRows}`)}${pageMetric('code blocks', page.metrics.codeBlocks)}
        </div>
        ${pageError}${pageWarnings}
        <div class="comparison-heading"><div><h3>Page comparison</h3><p>Content-level preview; product navigation and chrome are intentionally omitted.</p></div><span>${escapeHtml(page.destinationPreviewProvenance.replaceAll('-', ' '))}</span></div>
        <div class="comparison">
          <section><header><strong>Yandex Wiki</strong><small>${escapeHtml(`${page.sourceCharacters} source characters`)}</small></header><iframe title="Yandex Wiki preview for ${escapeHtml(page.sourceTitle)}" sandbox loading="lazy" srcdoc="${escapeHtml(sourceDoc)}"></iframe></section>
          <section><header><strong>Confluence</strong><small>${escapeHtml(`${page.destinationCharacters} storage characters`)}</small></header><iframe title="Confluence preview for ${escapeHtml(page.destinationTitle)}" sandbox loading="lazy" srcdoc="${escapeHtml(destinationDoc)}"></iframe></section>
        </div>
        <h3>Attachments</h3>${attachmentRows}
      </div>
    </details>`;
  }

  private html(): string {
    const summary = this.data.summary;
    const created = this.data.pages.filter((page) => page.status === 'created').length;
    const updated = this.data.pages.filter((page) => page.status === 'updated').length;
    const failed = this.data.pages.filter((page) => page.status === 'failed').length;
    const planned = this.data.pages.filter((page) => page.status === 'planned').length;
    const skipped = this.data.pages.filter((page) => page.status === 'skipped').length;
    const attachmentBytes = this.data.pages.reduce((total, page) => total + page.attachmentBytes, 0);
    const totalLinks = summary ? summary.links.internal + summary.links.external + summary.links.attachments + summary.links.anchors : 0;
    const status = failed || this.data.errors.length ? 'Completed with errors' : this.data.dryRun ? 'Dry-run complete' : 'Migration complete';
    const statusClass = failed || this.data.errors.length ? 'failed' : this.data.dryRun ? 'planned' : 'created';
    const pages = [...this.data.pages].sort((left, right) => left.depth - right.depth || left.sourceSlug.localeCompare(right.sourceSlug));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(this.data.dryRun ? 'Dry-run' : 'Migration')} · ${escapeHtml(this.data.sourceRoot)}</title>
  <style>
    :root{color-scheme:light;--ink:#111827;--muted:#687386;--line:#e4e8ef;--panel:#fff;--soft:#f5f7fa;--accent:#315efb;--success:#16845b;--warn:#b26a00;--danger:#c53b44;font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:#eef1f5}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}.shell{max-width:1500px;margin:0 auto;padding:42px 26px 72px}
    .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:700;color:var(--accent)}h1{font-size:clamp(28px,4vw,48px);line-height:1.05;letter-spacing:-.035em;margin:10px 0 12px}.subtitle{color:var(--muted);max-width:850px;margin:0}.actions{display:flex;gap:10px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:9px 13px;color:var(--ink);font-weight:650;box-shadow:0 1px 2px #1018280a}.button.primary{background:var(--ink);border-color:var(--ink);color:#fff}
    .runline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:22px;color:var(--muted);font-size:13px}.pill{display:inline-flex;border-radius:999px;background:#edf0f5;color:#536074;padding:3px 8px;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.pill.created,.pill.updated,.pill.uploaded,.pill.reused{background:#e7f7f0;color:var(--success)}.pill.failed{background:#fdecee;color:var(--danger)}.pill.planned{background:#fff4dc;color:var(--warn)}.pill.skipped{background:#f0f1f3;color:#697386}
    .stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:28px 0}.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 17px;box-shadow:0 1px 2px #10182808}.stat span,.stat small{display:block;color:var(--muted)}.stat span{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.06em}.stat strong{display:block;font-size:27px;line-height:1.2;margin:7px 0 2px}.stat small{font-size:12px}
    .layout{display:grid;grid-template-columns:290px minmax(0,1fr);gap:18px;align-items:start}.sidebar{position:sticky;top:18px;max-height:calc(100vh - 36px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:17px}.sidebar h2{font-size:14px;margin:0 0 13px}.tree ul{list-style:none;margin:0;padding-left:14px;border-left:1px solid var(--line)}.tree>ul{padding-left:0;border-left:0}.tree li{margin:4px 0}.tree a{display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:8px;align-items:center;border-radius:7px;padding:6px 7px;color:var(--ink)}.tree a:hover{background:var(--soft);text-decoration:none}.tree a small{color:var(--muted);font-size:10px}.status-dot{width:8px;height:8px;border-radius:50%;background:#8993a3;display:inline-block;flex:none}.status-dot.created,.status-dot.updated{background:var(--success)}.status-dot.failed{background:var(--danger)}.status-dot.planned{background:#e6a31a}.filter{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:10px;font:inherit}.filter-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:13px}.filter-row button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 8px;font:inherit;font-size:11px;color:var(--muted);cursor:pointer}.filter-row button.active{color:#fff;background:var(--ink);border-color:var(--ink)}
    .content{min-width:0}.notice-list{border:1px solid var(--line);border-left:4px solid #e7a42b;border-radius:11px;background:#fffbf1;padding:15px 17px;margin-bottom:14px}.notice-list.errors{border-left-color:var(--danger);background:#fff5f5}.notice-list h2{font-size:14px;margin:0}.notice-list h2 span{color:var(--muted);font-weight:500}.notice-list ul{margin:10px 0 0;padding-left:19px}.page-card{background:var(--panel);border:1px solid var(--line);border-radius:13px;margin-bottom:12px;box-shadow:0 1px 2px #10182808;scroll-margin-top:18px}.page-card[open]{box-shadow:0 8px 25px #2530470c}.page-card>summary{display:flex;align-items:center;gap:11px;padding:15px 17px;cursor:pointer;list-style:none}.page-card>summary::-webkit-details-marker{display:none}.page-heading{display:flex;flex-direction:column;min-width:0;flex:1}.page-heading strong{font-size:15px;overflow:hidden;text-overflow:ellipsis}.page-heading small{color:var(--muted);font-size:12px}.page-body{border-top:1px solid var(--line);padding:18px}.page-links{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px}.metrics{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px}.metric{border:1px solid var(--line);border-radius:7px;background:var(--soft);padding:6px 9px;color:var(--muted);font-size:12px}.metric strong{color:var(--ink)}.page-notices{border-radius:8px;padding:11px 13px;margin:11px 0;background:#fff8e8;color:#765114}.page-notices.errors{background:#fff0f1;color:#8b2730}.page-notices strong{display:block}.page-notices p,.page-notices ul{margin:5px 0 0}.comparison-heading{display:flex;align-items:end;justify-content:space-between;gap:14px;margin:22px 0 9px}.comparison-heading h3{font-size:14px;margin:0}.comparison-heading p{font-size:12px;color:var(--muted);margin:2px 0 0}.comparison-heading>span{color:var(--muted);font-size:11px;text-transform:uppercase}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:10px}.comparison>section{min-width:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}.comparison header{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);background:var(--soft);padding:8px 11px}.comparison header small{color:var(--muted)}iframe{display:block;width:100%;height:470px;border:0;background:#fff}.page-body>h3{font-size:14px;margin:22px 0 9px}.attachment-table{overflow:auto}.attachment-table table{border-collapse:collapse;width:100%;font-size:12px}.attachment-table th,.attachment-table td{border-bottom:1px solid var(--line);padding:8px 7px;text-align:left}.attachment-table th{color:var(--muted);font-weight:650}.attachment-table td small{display:block;color:var(--danger);margin-top:3px}.muted{color:var(--muted)}.empty-results{display:none;border:1px dashed var(--line);border-radius:12px;padding:32px;text-align:center;color:var(--muted)}.footer{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
    @media(max-width:1000px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}.sidebar{position:static;max-height:none}.comparison{grid-template-columns:1fr}.topbar{flex-direction:column}}@media(max-width:560px){.shell{padding:24px 14px 52px}.stats{grid-template-columns:1fr}.page-body{padding:13px}.comparison-heading{align-items:flex-start;flex-direction:column}.comparison header{flex-direction:column}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div><div class="eyebrow">Migration report</div><h1>${escapeHtml(this.data.sourceRoot)}</h1><p class="subtitle">Yandex Wiki → Confluence space ${escapeHtml(this.data.spaceKey)}. Generated locally; this report is not part of the source repository.</p></div><div class="actions"><a class="button primary" href="report.json" download>Download JSON</a>${this.data.sourceRootUrl ? link(this.data.sourceRootUrl, 'Source root', 'button') : ''}${this.data.targetUrl ? link(this.data.targetUrl, 'Target parent', 'button') : ''}</div></header>
    <div class="runline"><span class="pill ${statusClass}">${escapeHtml(status)}</span><span>${escapeHtml(this.data.runId)}</span><span>·</span><span>${escapeHtml(duration(this.data.startedAt, this.data.finishedAt))}</span><span>·</span><span>${escapeHtml(this.data.dryRun ? 'read-only plan' : 'live migration')}</span><span>·</span><span title="${escapeHtml(this.data.state.path)}">state ${escapeHtml(this.data.state.id)} · ${escapeHtml(this.data.state.mode)} · ${escapeHtml(this.data.state.source)}</span></div>
    <section class="stats">
      ${statCard('Pages', this.data.pages.length, `${created} created · ${updated} updated · ${planned} planned`)}
      ${statCard('Attachments', summary?.attachments ?? 0, formatBytes(summary?.attachmentBytes ?? attachmentBytes))}
      ${statCard('Links', totalLinks, summary ? `${summary.links.internal} internal · ${summary.links.external} external` : 'No summary')}
      ${statCard('Tables', (summary?.staticTables ?? 0) + (summary?.dynamicTables ?? 0), `${summary?.dynamicTables ?? 0} dynamic · ${summary?.dynamicTableRows ?? 0} rows`)}
      ${statCard('Issues', this.data.errors.length + this.data.warnings.length, `${this.data.errors.length} errors · ${this.data.warnings.length} warnings`)}
    </section>
    <div class="layout">
      <aside class="sidebar"><h2>Page hierarchy</h2><input id="search" class="filter" type="search" placeholder="Filter pages…" aria-label="Filter pages"><div class="filter-row" role="group" aria-label="Status filter"><button type="button" class="active" data-filter="all">All ${this.data.pages.length}</button><button type="button" data-filter="created">Done ${created + updated}</button><button type="button" data-filter="planned">Planned ${planned}</button><button type="button" data-filter="failed">Failed ${failed}</button>${skipped ? `<button type="button" data-filter="skipped">Skipped ${skipped}</button>` : ''}</div><nav class="tree" aria-label="Migrated page tree">${this.tree()}</nav></aside>
      <div class="content">
        ${renderList('Errors', this.data.errors, 'errors')}${renderList('Warnings and degradations', this.data.warnings, 'warnings')}
        ${this.data.renames.length ? `<section class="notice-list"><h2>Renamed pages <span>${this.data.renames.length}</span></h2><ul>${this.data.renames.map((rename) => `<li>${escapeHtml(rename.sourceTitle)} → ${escapeHtml(rename.destinationTitle)}</li>`).join('')}</ul></section>` : ''}
        ${this.data.staleDestinationPageIds.length ? `<section class="notice-list"><h2>Stale destination mappings <span>${this.data.staleDestinationPageIds.length}</span></h2><ul>${this.data.staleDestinationPageIds.map((id) => `<li>${escapeHtml(id)}</li>`).join('')}</ul></section>` : ''}
        <div id="pages">${pages.map((page) => this.pageSection(page)).join('')}</div><div id="empty" class="empty-results">No pages match this filter.</div>
      </div>
    </div>
    <footer class="footer">Generated by ywtc · metadata schema v${this.data.version}</footer>
  </main>
  <script>
    (() => {
      const search = document.querySelector('#search');
      const buttons = [...document.querySelectorAll('[data-filter]')];
      const cards = [...document.querySelectorAll('.page-card')];
      const treeItems = [...document.querySelectorAll('[data-tree-status]')];
      const empty = document.querySelector('#empty');
      let filter = 'all';
      const apply = () => {
        const query = (search.value || '').trim().toLocaleLowerCase();
        let visible = 0;
        for (const card of cards) {
          const status = card.dataset.status;
          const statusMatches = filter === 'all' || (filter === 'created' ? ['created', 'updated'].includes(status) : status === filter);
          const matches = statusMatches && (!query || card.dataset.search.includes(query));
          card.hidden = !matches;
          if (matches) visible += 1;
        }
        for (const item of treeItems) {
          const card = document.querySelector(item.getAttribute('href'));
          item.closest('li').hidden = !card || card.hidden;
        }
        empty.style.display = visible ? 'none' : 'block';
      };
      search.addEventListener('input', apply);
      for (const button of buttons) button.addEventListener('click', () => {
        filter = button.dataset.filter;
        for (const candidate of buttons) candidate.classList.toggle('active', candidate === button);
        apply();
      });
    })();
  </script>
</body>
</html>`;
  }

  async write(stateFilename: string, reportsDirectory?: string): Promise<MigrationReportPaths> {
    this.finish();
    const root = reportsDirectory ?? path.join(path.dirname(stateFilename), 'reports');
    const directory = path.join(root, this.data.runId);
    await mkdir(directory, {recursive: true, mode: 0o700});
    const json = path.join(directory, 'report.json');
    const html = path.join(directory, 'index.html');
    await Promise.all([
      writeFile(json, `${JSON.stringify(this.data, null, 2)}\n`, {mode: 0o600}),
      writeFile(html, this.html(), {mode: 0o600}),
    ]);
    return {directory, html, json};
  }
}
