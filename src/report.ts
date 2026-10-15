import {createHash, randomUUID} from 'node:crypto';
import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {DiscoveredPage, GraphEdgeStatus, ProviderKind, SourceResource, SourceSelection, SourceStatus, TransferScope} from './domain.js';
import {IssueCollector, type IssueInput, type MigrationIssue} from './issues.js';
import type {PageTransferStatus, ResourceTransferState, RunStatus, StateLoadSource} from './state.js';

export type ReportInventoryStatus = 'pending' | 'complete' | 'failed';
export type ReportResourceStatus = ResourceTransferState['status'];

export interface TransferReportResource {
  sourceId: string;
  sourceName: string;
  kind: Exclude<SourceResource['kind'], 'grid'>;
  status: ReportResourceStatus;
  sourceBytes?: number;
  transferredBytes?: number;
  destinationId?: string;
  destinationName?: string;
  error?: string;
}

export interface TransferReportPage {
  sourceCanonicalId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  destinationId?: string;
  destinationTitle?: string;
  destinationUrl?: string;
  parentId?: string;
  depth: number;
  status: PageTransferStatus;
  inventoryStatus: ReportInventoryStatus;
  resources: number;
  resourceItems: TransferReportResource[];
  sourceBytes?: number;
  transferredBytes: number;
  bytesUnknown: number;
  links: number;
  images: number;
  tables: number;
  grids: number;
  codeBlocks: number;
  degraded: boolean;
  resourceFallbacks: Array<{name: string; error: string}>;
  warnings: string[];
  normalizations?: string[];
  error?: string;
}

export interface TransferReportEdge {
  from: string;
  raw: string;
  to?: string;
  status: GraphEdgeStatus;
  message?: string;
}

export interface TransferReportIssue extends MigrationIssue {
  pageTitle?: string;
  pageAnchor?: string;
  resourceName?: string;
  action: string;
}

type PageStatusCounts = Record<PageTransferStatus, number>;
type ResourceStatusCounts = Record<ReportResourceStatus, number>;
type EdgeStatusCounts = Record<GraphEdgeStatus, number>;

export interface TransferReportSummary {
  pages: number;
  returnedDescendants: number;
  selectedDescendants: number;
  excludedPages: number;
  maximumDepth: number;
  hierarchyGaps: number;
  hierarchyRepairs: number;
  complete: number;
  partial: number;
  failed: number;
  blocked: number;
  conflicts: number;
  unprocessedPages: number;
  resources: number;
  attachments: number;
  resourceImages: number;
  resourcesComplete: number;
  resourcesPartial: number;
  resourcesFailed: number;
  resourcesPlanned: number;
  bytes: number;
  sourceBytes: number;
  bytesUnknown: number;
  links: number;
  images: number;
  tables: number;
  grids: number;
  codeBlocks: number;
  cycles: number;
  normalizations: number;
  degradations: number;
  warnings: number;
  errors: number;
  retryableFailures: number;
  inventoryComplete: boolean;
  inventoriedPages: number;
  inventoryFailedPages: number;
  durationMs?: number;
  pageStatuses: PageStatusCounts;
  resourceStatuses: ResourceStatusCounts;
  traversalStatuses: EdgeStatusCounts;
}

export interface TransferReportData {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  dryRun: boolean;
  scope: TransferScope;
  sourceStatus: SourceStatus;
  selection: SourceSelection;
  direction: string;
  source: {provider: ProviderKind; profile: string; rootId: string; title: string; url: string};
  destination: {provider: ProviderKind | 'filesystem'; profile?: string; id: string; url?: string; format?: string};
  state: {id: string; path: string; mode: 'automatic' | 'explicit'; source: StateLoadSource; backupPath?: string};
  pages: TransferReportPage[];
  edges: TransferReportEdge[];
  hierarchyRepairs: Array<{
    sourceCanonicalId: string;
    mode: 'moved' | 'recreated';
    oldParentId?: string;
    newParentId: string;
    oldDestinationId: string;
    newDestinationId: string;
    verified: boolean;
  }>;
  warnings: string[];
  errors: string[];
  issues: TransferReportIssue[];
  outputs: Array<{label: string; value: string}>;
  summary: TransferReportSummary;
}

export interface MigrationReportPaths {
  runId: string;
  directory: string;
  html: string;
  json: string;
}

interface PreviewPair {source: string; destination: string}

const pageStatuses: PageTransferStatus[] = [
  'discovered',
  'planned',
  'skeleton-created',
  'complete',
  'partial',
  'conflict',
  'failed',
  'blocked',
];
const resourceStatuses: ReportResourceStatus[] = ['planned', 'complete', 'partial', 'failed'];
const edgeStatuses: GraphEdgeStatus[] = ['resolved', 'external', 'inaccessible', 'broken', 'cycle', 'unsupported'];

function countRecord<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function emptySummary(): TransferReportSummary {
  return {
    pages: 0,
    returnedDescendants: 0,
    selectedDescendants: 0,
    excludedPages: 0,
    maximumDepth: 0,
    hierarchyGaps: 0,
    hierarchyRepairs: 0,
    complete: 0,
    partial: 0,
    failed: 0,
    blocked: 0,
    conflicts: 0,
    unprocessedPages: 0,
    resources: 0,
    attachments: 0,
    resourceImages: 0,
    resourcesComplete: 0,
    resourcesPartial: 0,
    resourcesFailed: 0,
    resourcesPlanned: 0,
    bytes: 0,
    sourceBytes: 0,
    bytesUnknown: 0,
    links: 0,
    images: 0,
    tables: 0,
    grids: 0,
    codeBlocks: 0,
    cycles: 0,
    normalizations: 0,
    degradations: 0,
    warnings: 0,
    errors: 0,
    retryableFailures: 0,
    inventoryComplete: false,
    inventoriedPages: 0,
    inventoryFailedPages: 0,
    pageStatuses: countRecord(pageStatuses),
    resourceStatuses: countRecord(resourceStatuses),
    traversalStatuses: countRecord(edgeStatuses),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function statusClass(value: string): string {
  return value === 'complete' || value === 'completed' ? 'ok'
    : /partial|warning|conflict|planned|discovered|skeleton|interrupted|cancelled/.test(value) ? 'warn'
      : /failed|blocked|error/.test(value) ? 'bad'
        : 'muted';
}

function pageAnchor(sourceCanonicalId: string): string {
  return `page-${createHash('sha256').update(sourceCanonicalId).digest('hex').slice(0, 12)}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let amount = value;
  let unit = -1;
  do {
    amount /= 1024;
    unit += 1;
  } while (amount >= 1024 && unit < units.length - 1);
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return 'in progress';
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

function issueAction(issue: MigrationIssue): string {
  if (issue.retryable) return 'Repeat the same migration to retry this object.';
  if (issue.severity === 'degradation') return 'Data remains represented; compare the source and destination previews.';
  if (issue.severity === 'error') return 'Review the reason and affected object before resuming the migration.';
  if (issue.severity === 'normalization') return 'No action is required.';
  return 'Review the affected object and the page details below.';
}

function statCard(label: string, value: string | number, detail?: string): string {
  return `<div class="stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</div>`;
}

function statusCells(counts: Record<string, number>, statuses: string[]): string {
  return statuses.map((status) => `<td><span class="status ${statusClass(status)}">${escapeHtml(status)}</span><strong>${escapeHtml(counts[status] ?? 0)}</strong></td>`).join('');
}

function renderReport(data: TransferReportData, previews: Map<string, PreviewPair>): string {
  const sourceUrl = safeHttpUrl(data.source.url);
  const destinationUrl = safeHttpUrl(data.destination.url);
  const inventoryState = data.summary.inventoryComplete
    ? `${data.summary.inventoriedPages}/${data.summary.pages} pages inspected`
    : `${data.summary.inventoriedPages}/${data.summary.pages} pages inspected · ${data.summary.inventoryFailedPages} failed`;
  const sourceCards = [
    statCard('Selected pages', data.summary.pages, 'accessible in selected scope'),
    statCard('Returned descendants', data.summary.returnedDescendants, `${data.summary.excludedPages} excluded by status`),
    statCard('Tree depth', data.summary.maximumDepth, `${data.summary.hierarchyGaps} hierarchy gaps · ${data.summary.hierarchyRepairs} repaired`),
    statCard('Files', data.summary.resources, `${data.summary.attachments} attachments · ${data.summary.resourceImages} images`),
    statCard('Source bytes', formatBytes(data.summary.sourceBytes), data.summary.bytesUnknown ? `${data.summary.bytesUnknown} sizes unknown` : 'all sizes known'),
    statCard('Transferred bytes', formatBytes(data.summary.bytes), 'confirmed complete files'),
    statCard('Links', data.summary.links, `${data.summary.images} embedded images`),
    statCard('Structured content', data.summary.tables + data.summary.codeBlocks, `${data.summary.tables} tables · ${data.summary.grids} grids · ${data.summary.codeBlocks} code blocks`),
  ].join('');
  const excludedRows = data.selection.excluded.map((page) => `<tr><td>${escapeHtml(page.title ?? page.locator)}</td><td><code>${escapeHtml(page.id)}</code></td><td>${escapeHtml(page.status ?? 'non-current')}</td><td>${escapeHtml(page.reason)}</td></tr>`).join('');
  const gapRows = data.selection.hierarchyGaps.map((gap) => `<tr><td><code>${escapeHtml(gap.pageId)}</code></td><td><code>${escapeHtml(gap.missingParentId ?? 'unknown')}</code></td><td><code>${escapeHtml(gap.selectedParentId)}</code></td><td>${escapeHtml(gap.reason)}</td></tr>`).join('');
  const repairRows = data.hierarchyRepairs.map((repair) => `<tr><td><code>${escapeHtml(repair.sourceCanonicalId)}</code></td><td>${escapeHtml(repair.mode)}</td><td><code>${escapeHtml(repair.oldParentId ?? 'none')}</code></td><td><code>${escapeHtml(repair.newParentId)}</code></td><td><code>${escapeHtml(repair.oldDestinationId)} → ${escapeHtml(repair.newDestinationId)}</code></td><td>${repair.verified ? 'verified' : 'planned'}</td></tr>`).join('');
  const selectionDetails = excludedRows || gapRows || repairRows || data.selection.notes.length
    ? `<section class="panel" aria-labelledby="selection-title"><div class="section-head"><div><h2 id="selection-title">Selection and hierarchy</h2><p>Every source-status exclusion, projected hierarchy gap, and destination repair recorded for this run.</p></div></div>${excludedRows ? `<div class="table-wrap"><h3>Excluded pages</h3><table><thead><tr><th>Page</th><th>Source ID</th><th>Status</th><th>Reason</th></tr></thead><tbody>${excludedRows}</tbody></table></div>` : ''}${gapRows ? `<div class="table-wrap"><h3>Hierarchy gaps</h3><table><thead><tr><th>Page</th><th>Missing parent</th><th>Projected parent</th><th>Reason</th></tr></thead><tbody>${gapRows}</tbody></table></div>` : ''}${repairRows ? `<div class="table-wrap"><h3>Destination repairs</h3><table><thead><tr><th>Source page</th><th>Mode</th><th>Old parent</th><th>New parent</th><th>Destination mapping</th><th>Outcome</th></tr></thead><tbody>${repairRows}</tbody></table></div>` : ''}${data.selection.notes.length ? `<div class="callout"><h3>Provider notes</h3><ul>${data.selection.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}</section>`
    : '';
  const pageOutcomeStatuses: PageTransferStatus[] = ['complete', 'partial', 'failed', 'blocked', 'conflict', 'planned', 'discovered', 'skeleton-created'];
  const resourceOutcomeStatuses: ReportResourceStatus[] = ['complete', 'partial', 'failed', 'planned'];
  const attentionIssues = data.issues.filter((issue) => issue.severity !== 'normalization');
  const normalizationIssues = data.issues.filter((issue) => issue.severity === 'normalization');
  const attentionSummary = [
    `${data.summary.errors} errors`,
    `${data.summary.warnings} warnings`,
    `${data.summary.degradations} degradations`,
    `${data.summary.retryableFailures} retryable`,
  ].map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  const issueRow = (issue: TransferReportIssue): string => {
    const target = issue.pageAnchor ? `<a href="#${escapeHtml(issue.pageAnchor)}">${escapeHtml(issue.pageTitle ?? issue.pageId)}</a>` : '<span>run-level</span>';
    return `<li class="issue ${escapeHtml(issue.severity)}"><div><span class="status ${statusClass(issue.severity)}">${escapeHtml(issue.severity)}</span><strong>${escapeHtml(issue.code)}</strong><span>${escapeHtml(issue.phase)}</span>${issue.retryable ? '<span class="retry">retryable</span>' : ''}${issue.occurrences > 1 ? `<span>${issue.occurrences} occurrences</span>` : ''}</div><p>${escapeHtml(issue.message)}</p><p class="issue-context">Affected: ${target}${issue.resourceName ? ` · resource <strong>${escapeHtml(issue.resourceName)}</strong>` : ''}</p><p class="action">${escapeHtml(issue.action)}</p></li>`;
  };
  const attention = `<section class="panel attention" aria-labelledby="attention-title"><div class="section-head"><div><h2 id="attention-title">Needs attention</h2><p>Problems and fidelity changes that may require review or a rerun.</p></div><span class="count ${attentionIssues.length ? 'warn' : 'ok'}">${attentionIssues.length}</span></div><div class="mini-stats">${attentionSummary}</div>${attentionIssues.length ? `<ul class="issue-list">${attentionIssues.map(issueRow).join('')}</ul>` : '<p class="empty ok">No errors, warnings, conflicts, or degradations were recorded.</p>'}</section>`;
  const pageRows = data.pages.map((page) => {
    const source = safeHttpUrl(page.sourceUrl);
    const destination = safeHttpUrl(page.destinationUrl);
    const preview = previews.get(page.sourceCanonicalId);
    const pageIssues = data.issues.filter((issue) => issue.pageId === page.sourceCanonicalId);
    const resourceRows = page.resourceItems.map((resource) => `<tr><td><strong>${escapeHtml(resource.sourceName)}</strong><small>${escapeHtml(resource.kind)}</small></td><td><span class="status ${statusClass(resource.status)}">${escapeHtml(resource.status)}</span></td><td>${resource.sourceBytes === undefined ? 'unknown' : escapeHtml(formatBytes(resource.sourceBytes))}</td><td>${resource.transferredBytes === undefined ? '—' : escapeHtml(formatBytes(resource.transferredBytes))}</td><td>${escapeHtml(resource.destinationName ?? '—')}</td><td>${resource.error ? `<span class="bad">${escapeHtml(resource.error)}</span>` : '—'}</td></tr>`).join('');
    const metrics = `${page.resources} files · ${page.links} links · ${page.images} images · ${page.tables} tables · ${page.codeBlocks} code blocks`;
    return `<details id="${escapeHtml(pageAnchor(page.sourceCanonicalId))}" class="page" style="--depth:${Math.min(page.depth, 8)}"${page.status === 'complete' ? '' : ' open'}><summary><span class="status ${statusClass(page.status)}">${escapeHtml(page.status)}</span><strong>${escapeHtml(page.sourceTitle)}</strong><span>${escapeHtml(metrics)}</span></summary>
      <div class="meta"><span>inventory: <strong>${escapeHtml(page.inventoryStatus)}</strong></span><span>depth ${page.depth}</span>${page.parentId ? `<span>parent ${escapeHtml(page.parentId)}</span>` : ''}${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">source</a>` : ''}${destination ? `<a href="${escapeHtml(destination)}" target="_blank" rel="noreferrer">destination</a>` : ''}<span>${escapeHtml(page.sourceCanonicalId)}</span><span>source ${page.sourceBytes === undefined ? 'size unknown' : escapeHtml(formatBytes(page.sourceBytes))} · transferred ${escapeHtml(formatBytes(page.transferredBytes))}${page.bytesUnknown ? ` · ${page.bytesUnknown} unknown` : ''}</span></div>
      ${page.error ? `<div class="callout bad"><strong>Page error</strong><p>${escapeHtml(page.error)}</p></div>` : ''}
      ${pageIssues.length ? `<div><h3>Page issues</h3><ul class="issue-list compact">${pageIssues.map(issueRow).join('')}</ul></div>` : ''}
      ${page.resourceItems.length ? `<div class="table-wrap"><h3>Resources</h3><table><thead><tr><th>Source resource</th><th>Outcome</th><th>Source size</th><th>Transferred</th><th>Destination name</th><th>Problem</th></tr></thead><tbody>${resourceRows}</tbody></table></div>` : '<p class="muted">No transferable resources on this page.</p>'}
      ${preview ? `<div class="compare"><section><h3>Source preview</h3><p class="muted">Normalized source content</p><iframe title="Source preview: ${escapeHtml(page.sourceTitle)}" sandbox srcdoc="${escapeHtml(preview.source)}"></iframe></section><section><h3>Destination preview</h3><p class="muted">Body read back from destination</p><iframe title="Destination preview: ${escapeHtml(page.sourceTitle)}" sandbox srcdoc="${escapeHtml(preview.destination)}"></iframe></section></div>` : '<p class="muted">Destination preview is unavailable because no body was read back.</p>'}
      ${page.resourceFallbacks.length ? `<div class="callout warn"><h3>Resource fallbacks</h3><ul>${page.resourceFallbacks.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.error)}</li>`).join('')}</ul></div>` : ''}
      ${(page.normalizations ?? []).length ? `<div><h3>Safe normalizations</h3><ul>${(page.normalizations ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    </details>`;
  }).join('');
  const edgeRows = data.edges.map((edge) => {
    const from = data.pages.find((page) => page.sourceCanonicalId === edge.from)?.sourceTitle ?? edge.from;
    const to = edge.to ? data.pages.find((page) => page.sourceCanonicalId === edge.to)?.sourceTitle ?? edge.to : '—';
    return `<tr><td><span class="status ${statusClass(edge.status)}">${escapeHtml(edge.status)}</span></td><td>${escapeHtml(from)}</td><td>${escapeHtml(to)}</td><td><code>${escapeHtml(edge.raw)}</code></td><td>${escapeHtml(edge.message ?? '—')}</td></tr>`;
  }).join('');
  const traversalSummary = edgeStatuses.filter((status) => data.summary.traversalStatuses[status] > 0).map((status) => `<span><strong>${data.summary.traversalStatuses[status]}</strong> ${escapeHtml(status)}</span>`).join('');
  const traversalBody = data.edges.length
    ? `<div class="mini-stats">${traversalSummary}</div><div class="table-wrap"><table><thead><tr><th>Status</th><th>From</th><th>To</th><th>Reference</th><th>Reason</th></tr></thead><tbody>${edgeRows}</tbody></table></div>`
    : data.scope === 'linked'
      ? '<p class="empty">No traversal edges were discovered in linked scope.</p>'
      : `<p class="empty">Traversal edges are collected only for <code>linked</code> scope. This ${escapeHtml(data.scope)} run still inventoried ${data.summary.links} content links and verified them as part of each page body.</p>`;
  const outputRows = data.outputs.map((output) => `<li><strong>${escapeHtml(output.label)}</strong> <code>${escapeHtml(output.value)}</code></li>`).join('');
  const normalizations = normalizationIssues.length
    ? `<section class="panel"><div class="section-head"><div><h2>Safe normalizations</h2><p>Expected provider changes that did not lose meaningful data.</p></div><span class="count">${normalizationIssues.length}</span></div><ul class="issue-list compact">${normalizationIssues.map(issueRow).join('')}</ul></section>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ywtc transfer ${escapeHtml(data.runId)}</title><style>
    :root{font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f6fa;color-scheme:light}*{box-sizing:border-box}body{margin:0}a{color:#175cd3}main{max-width:1360px;margin:auto;padding:32px}.head,.section-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.head h1{margin:0}.head p,.section-head p{margin:.25rem 0}.muted{color:#667085}.run-meta,.meta,.mini-stats{display:flex;flex-wrap:wrap;gap:10px 18px}.run-meta{margin-top:18px;padding:14px 0;border-top:1px solid #dfe4ed}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:18px 0}.stat,.page,.panel{background:#fff;border:1px solid #dfe4ed;border-radius:12px;box-shadow:0 1px 2px rgba(16,24,40,.04)}.stat{padding:14px}.stat small,.stat strong,.stat span{display:block}.stat strong{font-size:24px}.stat span{font-size:12px;color:#667085;margin-top:2px}.panel{padding:20px;margin-top:20px;overflow:hidden}.panel h2{margin:0}.count{display:grid;place-items:center;min-width:38px;height:38px;border-radius:20px;background:#eef2f8;font-weight:800}.page{margin:10px 0 10px calc(var(--depth) * 12px);padding:14px;scroll-margin-top:18px}.page:target{outline:3px solid #84adff}.page summary{display:grid;grid-template-columns:120px minmax(180px,1fr) auto;gap:12px;cursor:pointer;align-items:center}.status{display:inline-block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.ok{color:#087443}.warn{color:#9a6500}.bad{color:#b42318}.meta{margin:14px 0;color:#667085;font-size:13px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.compare section{min-width:0}.compare h3{margin-bottom:0}.compare iframe{width:100%;height:420px;border:1px solid #dfe4ed;border-radius:8px;background:#fff}.table-wrap{overflow:auto;margin-top:14px}table{border-collapse:collapse;width:100%;min-width:680px}th,td{padding:9px;border-bottom:1px solid #e6e9ef;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#667085}td strong,td small{display:block}.outcomes td strong{font-size:18px;margin-top:3px}.issue-list{list-style:none;padding:0;margin:14px 0 0}.issue{border-left:4px solid #f79009;background:#fffaeb;padding:12px 14px;margin:8px 0;border-radius:6px}.issue.error{border-color:#f04438;background:#fef3f2}.issue.degradation{border-color:#f79009}.issue.normalization{border-color:#98a2b3;background:#f9fafb}.issue>div{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.issue p{margin:.35rem 0}.issue-context,.action{font-size:13px}.retry{font-size:11px;background:#fff0c2;border-radius:12px;padding:2px 7px}.compact .issue{padding:9px 11px}.callout{padding:12px 14px;border-radius:8px;background:#f9fafb;margin:12px 0}.callout.warn{background:#fffaeb}.callout.bad{background:#fef3f2}.empty{padding:14px;border-radius:8px;background:#f9fafb}.attention{border-top:4px solid #f79009}.attention:has(.empty.ok){border-top-color:#12b76a}.context-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.context-grid dl{margin:0}.context-grid dt{font-size:12px;text-transform:uppercase;color:#667085}.context-grid dd{margin:2px 0 12px;overflow-wrap:anywhere}code{overflow-wrap:anywhere}@media(max-width:760px){main{padding:16px}.page{margin-left:0}.page summary{grid-template-columns:1fr}.compare{grid-template-columns:1fr}.head,.section-head{display:block}.count{margin-top:10px}.stats{grid-template-columns:1fr 1fr}.panel{padding:14px}}@media(max-width:420px){.stats{grid-template-columns:1fr}}
  </style></head><body><main><header class="head"><div><h1>ywtc transfer report</h1><p>${escapeHtml(data.direction)} · ${escapeHtml(data.scope)} · source status ${escapeHtml(data.sourceStatus)} · ${data.dryRun ? 'dry-run' : 'live transfer'}</p></div><div><span class="status ${statusClass(data.status)}">${escapeHtml(data.status)}</span><p class="muted">${escapeHtml(data.runId)}</p></div></header>
  <div class="run-meta"><span>Started <strong>${escapeHtml(data.startedAt)}</strong></span>${data.finishedAt ? `<span>Finished <strong>${escapeHtml(data.finishedAt)}</strong></span>` : ''}<span>Duration <strong>${escapeHtml(formatDuration(data.summary.durationMs))}</strong></span><span>Inventory <strong class="${data.summary.inventoryComplete ? 'ok' : 'warn'}">${escapeHtml(inventoryState)}</strong></span></div>
  <section class="panel" aria-labelledby="source-title"><div class="section-head"><div><h2 id="source-title">Source scope inventory</h2><p>Root plus ${escapeHtml(data.summary.returnedDescendants)} accessible descendants; ${escapeHtml(data.summary.selectedDescendants)} selected and ${escapeHtml(data.summary.excludedPages)} excluded with source status <code>${escapeHtml(data.sourceStatus)}</code>.</p></div><span class="status ${data.summary.inventoryComplete ? 'ok' : 'warn'}">${data.summary.inventoryComplete ? 'complete' : 'incomplete'}</span></div><div class="stats">${sourceCards}</div></section>
  ${selectionDetails}
  <section class="panel" aria-labelledby="outcome-title"><div class="section-head"><div><h2 id="outcome-title">Transfer outcomes</h2><p>Every selected page and discovered file is counted in exactly one status.</p></div><span class="count">${data.summary.pages}</span></div><div class="table-wrap"><table class="outcomes"><thead><tr><th>Object</th>${pageOutcomeStatuses.map((status) => `<th>${escapeHtml(status)}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr><th>Pages</th>${statusCells(data.summary.pageStatuses, pageOutcomeStatuses)}<td><strong>${data.summary.pages}</strong></td></tr></tbody></table></div><div class="table-wrap"><table class="outcomes"><thead><tr><th>Object</th>${resourceOutcomeStatuses.map((status) => `<th>${escapeHtml(status)}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr><th>Files</th>${statusCells(data.summary.resourceStatuses, resourceOutcomeStatuses)}<td><strong>${data.summary.resources}</strong></td></tr></tbody></table></div></section>
  ${attention}
  <section aria-labelledby="pages-title"><div class="section-head"><div><h2 id="pages-title">Pages</h2><p>Projected hierarchy with exact outcomes, source metrics, resources, issues, and verified previews.</p></div></div>${pageRows || '<p class="empty">No source page was resolved before the run stopped.</p>'}</section>
  <section class="panel" aria-labelledby="links-title"><div class="section-head"><div><h2 id="links-title">Link traversal</h2><p>Traversal evidence used to select pages in linked scope; content link totals are shown in source inventory.</p></div><span class="count">${data.edges.length}</span></div>${traversalBody}</section>
  ${normalizations}
  <section class="panel" aria-labelledby="context-title"><h2 id="context-title">Run context and outputs</h2><div class="context-grid"><dl><dt>Source</dt><dd>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(data.source.title)}</a>` : escapeHtml(data.source.title)}<br>${escapeHtml(data.source.provider)} · profile ${escapeHtml(data.source.profile)} · root ${escapeHtml(data.source.rootId)}</dd><dt>Destination</dt><dd>${destinationUrl ? `<a href="${escapeHtml(destinationUrl)}">${escapeHtml(data.destination.provider)}</a>` : escapeHtml(data.destination.provider)}${data.destination.profile ? ` · profile ${escapeHtml(data.destination.profile)}` : ''}<br>${escapeHtml(data.destination.id)}</dd></dl><dl><dt>State</dt><dd>${escapeHtml(data.state.id)}<br><code>${escapeHtml(data.state.path)}</code><br>${escapeHtml(data.state.mode)} · ${escapeHtml(data.state.source)}</dd>${data.state.backupPath ? `<dt>State backup</dt><dd><code>${escapeHtml(data.state.backupPath)}</code></dd>` : ''}<dt>Outputs</dt><dd>${outputRows ? `<ul>${outputRows}</ul>` : 'No result output was created.'}</dd></dl></div><p><a class="download" download="report.json" href="report.json">Download report JSON</a></p></section>
  </main></body></html>`;
}

export class TransferReport {
  readonly data: TransferReportData;
  private readonly previews = new Map<string, PreviewPair>();
  private readonly issueCollector = new IssueCollector();

  constructor(input: Omit<TransferReportData, 'runId' | 'startedAt' | 'status' | 'sourceStatus' | 'selection' | 'pages' | 'edges' | 'hierarchyRepairs' | 'warnings' | 'errors' | 'issues' | 'outputs' | 'summary'> & {sourceStatus?: SourceStatus}) {
    const sourceStatus = input.sourceStatus ?? 'all';
    this.data = {
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      status: 'running',
      sourceStatus,
      selection: {
        requestedStatus: sourceStatus,
        effectiveStatus: sourceStatus,
        returnedDescendants: 0,
        selectedDescendants: 0,
        excluded: [],
        maximumDepth: 0,
        hierarchyGaps: [],
        notes: [],
      },
      pages: [],
      edges: [],
      hierarchyRepairs: [],
      warnings: [],
      errors: [],
      issues: [],
      outputs: [],
      summary: emptySummary(),
      ...input,
    };
  }

  registerPages(pages: DiscoveredPage[]): void {
    for (const page of pages) {
      if (this.data.pages.some((item) => item.sourceCanonicalId === page.canonicalId)) continue;
      this.data.pages.push({
        sourceCanonicalId: page.canonicalId,
        sourceId: page.id,
        sourceTitle: page.title,
        sourceUrl: page.url,
        ...(page.projectedParentId ? {parentId: page.projectedParentId} : {}),
        depth: page.depth,
        status: 'discovered',
        inventoryStatus: 'pending',
        resources: 0,
        resourceItems: [],
        transferredBytes: 0,
        bytesUnknown: 0,
        links: 0,
        images: 0,
        tables: 0,
        grids: 0,
        codeBlocks: 0,
        degraded: false,
        resourceFallbacks: [],
        warnings: [],
        normalizations: [],
      });
    }
  }

  updatePage(sourceCanonicalId: string, update: Partial<TransferReportPage>): void {
    const index = this.data.pages.findIndex((page) => page.sourceCanonicalId === sourceCanonicalId);
    if (index < 0) throw new Error(`Report page ${sourceCanonicalId} is not registered`);
    this.data.pages[index] = {...this.data.pages[index]!, ...update};
  }

  addPage(page: TransferReportPage, previews?: PreviewPair, collectIssues = true): void {
    page.warnings = [...new Set(page.warnings)];
    page.normalizations = [...new Set(page.normalizations ?? [])];
    const index = this.data.pages.findIndex((item) => item.sourceCanonicalId === page.sourceCanonicalId);
    if (index >= 0) this.data.pages[index] = {...this.data.pages[index]!, ...page};
    else this.data.pages.push(page);
    if (previews) this.previews.set(page.sourceCanonicalId, previews);
    if (!collectIssues) return;
    for (const message of page.normalizations) this.issue({code: `normalization:${message}`, severity: 'normalization', phase: 'page', pageId: page.sourceCanonicalId, retryable: false, message});
    for (const message of page.warnings) this.issue({code: `warning:${message}`, severity: page.degraded ? 'degradation' : 'warning', phase: 'page', pageId: page.sourceCanonicalId, retryable: false, message});
  }

  setEdges(edges: TransferReportEdge[]): void { this.data.edges = edges; }
  setSelection(selection: SourceSelection): void {
    this.data.selection = selection;
    this.data.sourceStatus = selection.effectiveStatus;
  }
  addHierarchyRepair(repair: TransferReportData['hierarchyRepairs'][number]): void {
    this.data.hierarchyRepairs.push(repair);
  }
  issue(input: IssueInput): void { this.issueCollector.add(input); }
  warning(message: string): void { this.issue({code: `warning:${message}`, severity: 'warning', phase: 'report', retryable: false, message}); }
  error(message: string): void { this.issue({code: `error:${message}`, severity: 'error', phase: 'report', retryable: false, message}); }
  output(label: string, value: string): void { this.data.outputs.push({label, value}); }

  finish(status: RunStatus): void {
    this.data.status = status;
    this.data.finishedAt = new Date().toISOString();
    const pageById = new Map(this.data.pages.map((page) => [page.sourceCanonicalId, page]));
    this.data.issues = this.issueCollector.list().map((issue): TransferReportIssue => {
      const page = issue.pageId ? pageById.get(issue.pageId) : undefined;
      const resource = issue.resourceId ? page?.resourceItems.find((item) => item.sourceId === issue.resourceId) : undefined;
      return {
        ...issue,
        ...(page ? {pageTitle: page.sourceTitle, pageAnchor: pageAnchor(page.sourceCanonicalId)} : {}),
        ...(resource ? {resourceName: resource.sourceName} : {}),
        action: issueAction(issue),
      };
    });
    this.data.warnings = this.data.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);
    this.data.errors = this.data.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
    const pageStatusCounts = countRecord(pageStatuses);
    const resourceStatusCounts = countRecord(resourceStatuses);
    const traversalStatusCounts = countRecord(edgeStatuses);
    for (const page of this.data.pages) pageStatusCounts[page.status] += 1;
    const resources = this.data.pages.flatMap((page) => page.resourceItems);
    for (const resource of resources) resourceStatusCounts[resource.status] += 1;
    for (const edge of this.data.edges) traversalStatusCounts[edge.status] += 1;
    const started = Date.parse(this.data.startedAt);
    const finished = Date.parse(this.data.finishedAt);
    const sourceBytes = resources.reduce((total, resource) => total + (resource.sourceBytes ?? 0), 0);
    const transferredBytes = resources.reduce((total, resource) => total + (resource.status === 'complete' ? resource.transferredBytes ?? 0 : 0), 0);
    const inventoriedPages = this.data.pages.filter((page) => page.inventoryStatus === 'complete').length;
    const inventoryFailedPages = this.data.pages.filter((page) => page.inventoryStatus === 'failed').length;
    this.data.summary = {
      pages: this.data.pages.length,
      returnedDescendants: this.data.selection.returnedDescendants,
      selectedDescendants: this.data.selection.selectedDescendants,
      excludedPages: this.data.selection.excluded.length,
      maximumDepth: this.data.selection.maximumDepth,
      hierarchyGaps: this.data.selection.hierarchyGaps.length,
      hierarchyRepairs: this.data.hierarchyRepairs.length,
      complete: pageStatusCounts.complete,
      partial: pageStatusCounts.partial,
      failed: pageStatusCounts.failed,
      blocked: pageStatusCounts.blocked,
      conflicts: pageStatusCounts.conflict,
      unprocessedPages: pageStatusCounts.discovered + pageStatusCounts.planned + pageStatusCounts['skeleton-created'],
      resources: resources.length,
      attachments: resources.filter((resource) => resource.kind === 'attachment').length,
      resourceImages: resources.filter((resource) => resource.kind === 'image').length,
      resourcesComplete: resourceStatusCounts.complete,
      resourcesPartial: resourceStatusCounts.partial,
      resourcesFailed: resourceStatusCounts.failed,
      resourcesPlanned: resourceStatusCounts.planned,
      bytes: transferredBytes,
      sourceBytes,
      bytesUnknown: resources.filter((resource) => resource.sourceBytes === undefined).length,
      links: this.data.pages.reduce((total, page) => total + page.links, 0),
      images: this.data.pages.reduce((total, page) => total + page.images, 0),
      tables: this.data.pages.reduce((total, page) => total + page.tables, 0),
      grids: this.data.pages.reduce((total, page) => total + page.grids, 0),
      codeBlocks: this.data.pages.reduce((total, page) => total + page.codeBlocks, 0),
      cycles: traversalStatusCounts.cycle,
      normalizations: this.issueCollector.count('normalization'),
      degradations: this.issueCollector.count('degradation'),
      warnings: this.issueCollector.count('warning'),
      errors: this.issueCollector.count('error'),
      retryableFailures: this.issueCollector.countRetryableFailures(),
      inventoryComplete: this.data.pages.length > 0 && inventoriedPages === this.data.pages.length,
      inventoriedPages,
      inventoryFailedPages,
      ...(Number.isFinite(started) && Number.isFinite(finished) ? {durationMs: Math.max(0, finished - started)} : {}),
      pageStatuses: pageStatusCounts,
      resourceStatuses: resourceStatusCounts,
      traversalStatuses: traversalStatusCounts,
    };
  }

  async write(reportsDirectory: string): Promise<MigrationReportPaths> {
    const directory = path.join(reportsDirectory, this.data.runId);
    await mkdir(directory, {recursive: true, mode: 0o700});
    const json = path.join(directory, 'report.json');
    const html = path.join(directory, 'index.html');
    const jsonTemporary = `${json}.${process.pid}.tmp`;
    const htmlTemporary = `${html}.${process.pid}.tmp`;
    await writeFile(jsonTemporary, `${JSON.stringify(this.data, null, 2)}\n`, {mode: 0o600});
    await writeFile(htmlTemporary, renderReport(this.data, this.previews), {mode: 0o600});
    await rename(jsonTemporary, json);
    await rename(htmlTemporary, html);
    return {runId: this.data.runId, directory, html, json};
  }
}
