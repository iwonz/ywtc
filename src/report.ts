import {randomUUID} from 'node:crypto';
import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {GraphEdgeStatus, ProviderKind, TransferScope} from './domain.js';
import type {RunStatus, StateLoadSource} from './state.js';

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
  status: string;
  resources: number;
  bytes: number;
  links: number;
  images: number;
  tables: number;
  codeBlocks: number;
  degraded: boolean;
  warnings: string[];
  error?: string;
}

export interface TransferReportEdge {
  from: string;
  raw: string;
  to?: string;
  status: GraphEdgeStatus;
  message?: string;
}

export interface TransferReportData {
  version: 4;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  dryRun: boolean;
  scope: TransferScope;
  direction: string;
  source: {provider: ProviderKind; profile: string; rootId: string; title: string; url: string};
  destination: {provider: ProviderKind | 'filesystem'; profile?: string; id: string; url?: string; format?: string};
  state: {id: string; path: string; mode: 'automatic' | 'explicit'; source: StateLoadSource; backupPath?: string};
  pages: TransferReportPage[];
  edges: TransferReportEdge[];
  warnings: string[];
  errors: string[];
  outputs: Array<{label: string; value: string}>;
  summary: {pages: number; complete: number; partial: number; failed: number; resources: number; bytes: number; links: number; cycles: number};
}

export interface MigrationReportPaths {
  directory: string;
  html: string;
  json: string;
}

interface PreviewPair {source: string; destination: string}

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
  return /complete|created|updated|planned/.test(value) ? 'ok' : /partial|warning|conflict/.test(value) ? 'warn' : 'bad';
}

function renderReport(data: TransferReportData, previews: Map<string, PreviewPair>): string {
  const cards = [
    ['Pages', data.summary.pages], ['Complete', data.summary.complete], ['Partial', data.summary.partial],
    ['Failed', data.summary.failed], ['Resources', data.summary.resources], ['Bytes', data.summary.bytes],
    ['Links', data.summary.links], ['Cycles', data.summary.cycles],
  ].map(([label, value]) => `<div class="stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  const pageRows = data.pages.map((page) => {
    const source = safeHttpUrl(page.sourceUrl);
    const destination = safeHttpUrl(page.destinationUrl);
    const preview = previews.get(page.sourceCanonicalId);
    return `<details class="page" style="margin-left:${Math.min(page.depth, 8) * 14}px"><summary><span class="status ${statusClass(page.status)}">${escapeHtml(page.status)}</span><strong>${escapeHtml(page.sourceTitle)}</strong><span>${page.resources} files · ${page.links} links · depth ${page.depth}</span></summary>
      <div class="meta">${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">source</a>` : ''}${destination ? `<a href="${escapeHtml(destination)}" target="_blank" rel="noreferrer">destination</a>` : ''}<span>${escapeHtml(page.sourceCanonicalId)}</span></div>
      ${preview ? `<div class="compare"><section><h3>Source</h3><iframe sandbox srcdoc="${escapeHtml(preview.source)}"></iframe></section><section><h3>Destination</h3><iframe sandbox srcdoc="${escapeHtml(preview.destination)}"></iframe></section></div>` : ''}
      ${page.warnings.length ? `<ul class="warnings">${page.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${page.error ? `<p class="error">${escapeHtml(page.error)}</p>` : ''}</details>`;
  }).join('');
  const edgeRows = data.edges.map((edge) => `<tr><td>${escapeHtml(edge.status)}</td><td>${escapeHtml(edge.from)}</td><td>${escapeHtml(edge.to ?? '—')}</td><td>${escapeHtml(edge.raw)}</td></tr>`).join('');
  const outputRows = data.outputs.map((output) => `<li><strong>${escapeHtml(output.label)}</strong> <code>${escapeHtml(output.value)}</code></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ywtc transfer ${escapeHtml(data.runId)}</title><style>
    :root{font:15px/1.5 system-ui,sans-serif;color:#182033;background:#f3f5f9}body{margin:0}main{max-width:1280px;margin:auto;padding:32px}.head{display:flex;justify-content:space-between;gap:20px;align-items:end}.muted{color:#697386}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:24px 0}.stat,.page,.panel{background:#fff;border:1px solid #dfe4ed;border-radius:10px}.stat{padding:14px}.stat small,.stat strong{display:block}.stat strong{font-size:24px}.page{margin:10px 0;padding:12px}.page summary{display:grid;grid-template-columns:100px minmax(180px,1fr) auto;gap:12px;cursor:pointer}.status{font-size:12px;font-weight:700;text-transform:uppercase}.ok{color:#087443}.warn{color:#9a6500}.bad{color:#b42318}.meta{display:flex;gap:14px;margin:12px 0;color:#697386}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.compare section{min-width:0}.compare iframe{width:100%;height:420px;border:1px solid #dfe4ed;border-radius:8px;background:#fff}.panel{padding:18px;margin-top:24px;overflow:auto}table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #e6e9ef;text-align:left}.warnings{color:#805800}.error{color:#b42318}code{overflow-wrap:anywhere}@media(max-width:760px){main{padding:18px}.page summary{grid-template-columns:1fr}.compare{grid-template-columns:1fr}.head{display:block}}
  </style></head><body><main><header class="head"><div><h1>ywtc transfer report</h1><p>${escapeHtml(data.direction)} · ${escapeHtml(data.scope)} · ${data.dryRun ? 'dry-run' : 'live'}</p></div><div><span class="status ${statusClass(data.status)}">${escapeHtml(data.status)}</span><p class="muted">${escapeHtml(data.runId)}</p></div></header><div class="stats">${cards}</div><section><h2>Pages</h2>${pageRows || '<p>No pages.</p>'}</section><section class="panel"><h2>Link graph</h2><table><thead><tr><th>Status</th><th>From</th><th>To</th><th>Reference</th></tr></thead><tbody>${edgeRows}</tbody></table></section><section class="panel"><h2>Outputs</h2><ul>${outputRows}</ul><a download="report.json" href="report.json">Download report JSON</a></section>${data.errors.length ? `<section class="panel"><h2>Errors</h2><ul class="error">${data.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}${data.warnings.length ? `<section class="panel"><h2>Warnings</h2><ul class="warnings">${data.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}</main></body></html>`;
}

export class TransferReport {
  readonly data: TransferReportData;
  private readonly previews = new Map<string, PreviewPair>();

  constructor(input: Omit<TransferReportData, 'version' | 'runId' | 'startedAt' | 'status' | 'pages' | 'edges' | 'warnings' | 'errors' | 'outputs' | 'summary'>) {
    this.data = {
      version: 4,
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      status: 'running',
      pages: [],
      edges: [],
      warnings: [],
      errors: [],
      outputs: [],
      summary: {pages: 0, complete: 0, partial: 0, failed: 0, resources: 0, bytes: 0, links: 0, cycles: 0},
      ...input,
    };
  }

  addPage(page: TransferReportPage, previews?: PreviewPair): void {
    const index = this.data.pages.findIndex((item) => item.sourceCanonicalId === page.sourceCanonicalId);
    if (index >= 0) this.data.pages[index] = page;
    else this.data.pages.push(page);
    if (previews) this.previews.set(page.sourceCanonicalId, previews);
  }

  setEdges(edges: TransferReportEdge[]): void { this.data.edges = edges; }
  warning(message: string): void { this.data.warnings.push(message); }
  error(message: string): void { this.data.errors.push(message); }
  output(label: string, value: string): void { this.data.outputs.push({label, value}); }

  finish(status: RunStatus): void {
    this.data.status = status;
    this.data.finishedAt = new Date().toISOString();
    this.data.summary = {
      pages: this.data.pages.length,
      complete: this.data.pages.filter((page) => /complete|created|updated|planned/.test(page.status)).length,
      partial: this.data.pages.filter((page) => /partial|conflict/.test(page.status)).length,
      failed: this.data.pages.filter((page) => /failed|blocked/.test(page.status)).length,
      resources: this.data.pages.reduce((total, page) => total + page.resources, 0),
      bytes: this.data.pages.reduce((total, page) => total + page.bytes, 0),
      links: this.data.pages.reduce((total, page) => total + page.links, 0),
      cycles: this.data.edges.filter((edge) => edge.status === 'cycle').length,
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
    return {directory, html, json};
  }
}
