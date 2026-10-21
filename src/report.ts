import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {DiscoveredPage, SourceSelection, SourceStatus} from './domain.js';
import {redact} from './logger.js';
import {
  IssueCollector,
  type IssueCategory,
  type IssueInput,
  type IssueObjectType,
  type MigrationIssue,
} from './issues.js';
import {
  commentStatuses,
  edgeStatuses,
  pageStatuses,
  resourceStatuses,
  type MigrationReportPaths,
  type PreviewPair,
  type ReportPresentationPayload,
  type TransferReportData,
  type TransferReportExcludedPage,
  type TransferReportIssue,
  type TransferReportPage,
  type TransferReportSummary,
} from './report-contract.js';
import type {RunStatus} from './state.js';

export type {
  MigrationReportPaths,
  PreviewPair,
  ReportInventoryStatus,
  ReportPresentationPayload,
  ReportPresentationStatus,
  ReportResourceStatus,
  TransferReportCommentItem,
  TransferReportData,
  TransferReportEdge,
  TransferReportExcludedPage,
  TransferReportIssue,
  TransferReportPage,
  TransferReportResource,
  TransferReportSummary,
} from './report-contract.js';

export const REPORT_DATA_MARKER = '{"__ywtc_report_payload__":true}';

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
    notStartedPages: 0,
    unprocessedPages: 0,
    resources: 0,
    attachments: 0,
    resourceImages: 0,
    resourcesComplete: 0,
    resourcesPartial: 0,
    resourcesFailed: 0,
    resourcesBlocked: 0,
    resourcesNotStarted: 0,
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
    adaptations: 0,
    preservedExternalReferences: 0,
    degradations: 0,
    warnings: 0,
    errors: 0,
    rootErrors: 0,
    dependentPages: 0,
    dependentFiles: 0,
    dependentComments: 0,
    retryableFailures: 0,
    inventoryComplete: false,
    inventoriedPages: 0,
    inventoryFailedPages: 0,
    commentThreads: 0,
    comments: 0,
    commentParticipants: 0,
    commentAttachments: 0,
    commentBytes: 0,
    commentStatuses: countRecord(commentStatuses),
    pageStatuses: countRecord(pageStatuses),
    resourceStatuses: countRecord(resourceStatuses),
    traversalStatuses: countRecord(edgeStatuses),
  };
}

function issueCategory(issue: MigrationIssue): IssueCategory {
  if (issue.category) return issue.category;
  if (issue.severity === 'blocked' || issue.blockedByPageId) return 'dependency';
  if (issue.code === 'destination-ownership-ambiguity') return 'conflict';
  if (issue.code.startsWith('source-status-') || issue.code.startsWith('inventory-drift')) return 'filtering';
  if (issue.code.startsWith('authorization-')) return 'authorization';
  if (issue.code.startsWith('permissions-')) return 'permissions';
  if (issue.code.startsWith('rate-limit-')) return 'rate-limit';
  if (issue.code.startsWith('network-')) return 'network';
  if (issue.code.startsWith('parsing-')) return 'parsing';
  if (issue.code.startsWith('hierarchy-') || issue.code.startsWith('destination-hierarchy-') || issue.code === 'destination-parent-unavailable') return 'hierarchy';
  if (issue.phase === 'comment') return 'comment';
  if (issue.phase === 'resource') return 'attachment-image';
  if (issue.phase === 'verification') return 'verification';
  if (issue.severity === 'adaptation' || issue.severity === 'degradation') return 'rendering-layout';
  if (issue.phase === 'page' || issue.phase === 'discovery' || issue.phase === 'inventory') return 'provider-api';
  return 'unknown';
}

function issueObjectType(issue: MigrationIssue): IssueObjectType {
  if (issue.objectType) return issue.objectType;
  if (issue.resourceId) return 'resource';
  if (issue.commentId || issue.phase === 'comment') return 'comment';
  if (issue.pageId) return 'page';
  return 'run';
}

function issueAction(issue: MigrationIssue, category: IssueCategory): string {
  if (issue.severity === 'blocked') return 'Resolve the upstream page error, then repeat the same migration; this object will resume automatically.';
  if (issue.retryable) return 'Repeat the same migration to retry this object.';
  if (issue.severity === 'degradation') return 'Data remains represented; compare the source and destination previews.';
  if (issue.severity === 'adaptation') return 'No action is required; the destination uses an equivalent static or native representation.';
  if (issue.severity === 'normalization') return 'No action is required.';
  if (category === 'authorization') return 'Check the selected connection token, then run doctor and repeat the migration.';
  if (category === 'permissions') return 'Grant the token user access to the affected object, then repeat the migration.';
  if (category === 'parsing' || category === 'rendering-layout') return 'Inspect the comparison and fallback, then report the unsupported construct if the source data is not represented.';
  if (category === 'conflict') return 'Verify destination ownership and identity before repeating the migration.';
  if (issue.severity === 'error') return 'Review the reason and affected object before resuming the migration.';
  return 'Review the affected object and its page details.';
}

function serializePayload(payload: ReportPresentationPayload): string {
  return JSON.stringify(payload)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function sanitizedString(value: string, secrets: readonly string[]): string {
  const redacted = redact(value, [...secrets]);
  try {
    const url = new URL(redacted);
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return redacted;
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|auth|credential|signature|(^|[-_])key$|^x-amz-/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return redacted;
  }
}

function sanitizedValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return sanitizedString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => sanitizedValue(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizedValue(item, secrets)]));
  }
  return value;
}

function transformationIssueCode(kind: 'normalization' | 'adaptation' | 'warning', message: string): string {
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
              : undefined;
  const suffix = known ?? createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `content-${kind}-${suffix}`;
}

export function injectReportPayload(shell: string, payload: ReportPresentationPayload): string {
  const occurrences = shell.split(REPORT_DATA_MARKER).length - 1;
  if (occurrences !== 1) throw new Error(`Compiled report shell must contain exactly one data marker; found ${occurrences}`);
  return shell.replace(REPORT_DATA_MARKER, serializePayload(payload));
}

let shellPromise: Promise<string> | undefined;

async function loadReportShell(): Promise<string> {
  shellPromise ??= (async () => {
    const candidates = [
      fileURLToPath(new URL('./report-ui/index.html', import.meta.url)),
      fileURLToPath(new URL('../dist/report-ui/index.html', import.meta.url)),
    ];
    const errors: string[] = [];
    for (const filename of [...new Set(candidates)]) {
      try {
        return await readFile(filename, 'utf8');
      } catch (error) {
        errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Compiled report shell is unavailable. Run "npm run build:report". ${errors.join('; ')}`);
  })();
  return shellPromise;
}

function reportExcludedPages(selection: SourceSelection, data: TransferReportData): TransferReportExcludedPage[] {
  const selectedByProviderId = new Map(data.pages.map((page) => [page.sourceId, page]));
  const excludedCanonicalByProviderId = new Map(selection.excluded.map((page) => [
    page.id,
    page.canonicalId ?? `${data.source.profile}:${data.source.provider}:${page.id}`,
  ]));
  return selection.excluded.map((page) => {
    const sourceCanonicalId = excludedCanonicalByProviderId.get(page.id)!;
    const ancestors = page.ancestorIds ?? [];
    const projectedParentId = [page.parentId, ...ancestors.slice().reverse(), page.discoveredFromId]
      .find((candidate) => candidate && (selectedByProviderId.has(candidate) || excludedCanonicalByProviderId.has(candidate)));
    const canonicalParent = projectedParentId
      ? selectedByProviderId.get(projectedParentId)?.sourceCanonicalId ?? excludedCanonicalByProviderId.get(projectedParentId)
      : undefined;
    return {
      sourceCanonicalId,
      sourceId: page.id,
      sourceTitle: page.title ?? page.locator,
      ...(page.url ? {sourceUrl: page.url} : {}),
      ...(page.parentId ? {sourceParentId: page.parentId} : {}),
      ...(ancestors.length > 0 ? {sourceAncestorIds: ancestors} : {}),
      ...(canonicalParent ? {projectedParentId: canonicalParent} : {}),
      ...(page.discoveredFromId ? {discoveredFromId: page.discoveredFromId} : {}),
      ...(page.depth !== undefined ? {depth: page.depth} : {}),
      status: 'excluded',
      ...(page.status ? {sourceStatus: page.status} : {}),
      reason: page.reason,
      metadataComplete: page.metadataComplete ?? Boolean(page.title && page.url && (page.parentId || ancestors.length > 0)),
    };
  });
}

export class TransferReport {
  readonly data: TransferReportData;
  private readonly previews = new Map<string, PreviewPair>();
  private readonly issueCollector = new IssueCollector();
  private readonly secrets: string[];

  constructor(input: Omit<TransferReportData, 'startedAt' | 'status' | 'sourceStatus' | 'commentsEnabled' | 'selection' | 'pages' | 'excludedPages' | 'edges' | 'hierarchyRepairs' | 'warnings' | 'errors' | 'issues' | 'outputs' | 'summary'> & {sourceStatus?: SourceStatus; commentsEnabled?: boolean; secrets?: string[]}) {
    const {secrets = [], ...reportInput} = input;
    this.secrets = [...secrets];
    const sourceStatus = reportInput.sourceStatus ?? 'all';
    this.data = {
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
      excludedPages: [],
      edges: [],
      hierarchyRepairs: [],
      warnings: [],
      errors: [],
      issues: [],
      outputs: [],
      summary: emptySummary(),
      ...reportInput,
      commentsEnabled: reportInput.commentsEnabled ?? true,
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
        ...(page.parentId ? {sourceParentId: page.parentId} : {}),
        ...(page.ancestorIds?.length ? {sourceAncestorIds: page.ancestorIds} : {}),
        ...(page.projectedParentId ? {parentId: page.projectedParentId, projectedParentId: page.projectedParentId} : {}),
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
        adaptations: [],
        preservedExternalReferences: 0,
        comments: {status: this.data.commentsEnabled ? 'planned' : 'skipped', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
      });
    }
    if (this.data.selection.excluded.length > 0) this.data.excludedPages = reportExcludedPages(this.data.selection, this.data);
  }

  updatePage(sourceCanonicalId: string, update: Partial<TransferReportPage>): void {
    const index = this.data.pages.findIndex((page) => page.sourceCanonicalId === sourceCanonicalId);
    if (index < 0) throw new Error(`Report page ${sourceCanonicalId} is not registered`);
    this.data.pages[index] = {...this.data.pages[index]!, ...update};
  }

  addPage(page: TransferReportPage, previews?: PreviewPair, collectIssues = true): void {
    page.warnings = [...new Set(page.warnings)];
    page.normalizations = [...new Set(page.normalizations ?? [])];
    page.adaptations = [...new Set(page.adaptations ?? [])];
    const index = this.data.pages.findIndex((item) => item.sourceCanonicalId === page.sourceCanonicalId);
    if (index >= 0) this.data.pages[index] = {...this.data.pages[index]!, ...page};
    else this.data.pages.push(page);
    if (previews) this.previews.set(page.sourceCanonicalId, previews);
    if (this.data.selection.excluded.length > 0) this.data.excludedPages = reportExcludedPages(this.data.selection, this.data);
    if (!collectIssues) return;
    for (const message of page.normalizations) {
      this.issue({code: transformationIssueCode('normalization', message), severity: 'normalization', phase: 'page', pageId: page.sourceCanonicalId, retryable: false, message});
    }
    for (const message of page.adaptations) {
      this.issue({code: transformationIssueCode('adaptation', message), severity: 'adaptation', phase: 'page', pageId: page.sourceCanonicalId, retryable: false, message});
    }
    for (const message of page.warnings) {
      this.issue({code: transformationIssueCode('warning', message), severity: page.degraded ? 'degradation' : 'warning', phase: 'page', pageId: page.sourceCanonicalId, retryable: false, message});
    }
  }

  setEdges(edges: TransferReportData['edges']): void {
    this.data.edges = edges;
  }

  setSelection(selection: SourceSelection): void {
    this.data.selection = selection;
    this.data.sourceStatus = selection.effectiveStatus;
    this.data.excludedPages = reportExcludedPages(selection, this.data);
  }

  setDestinationUrl(url: string): void {
    this.data.destination.url = url;
  }

  addHierarchyRepair(repair: TransferReportData['hierarchyRepairs'][number]): void {
    this.data.hierarchyRepairs.push(repair);
  }

  issue(input: IssueInput): void {
    this.issueCollector.add({...input, message: sanitizedString(input.message, this.secrets)});
  }

  warning(message: string): void {
    this.issue({code: `warning:${message}`, severity: 'warning', phase: 'report', retryable: false, message});
  }

  error(message: string): void {
    this.issue({code: `error:${message}`, severity: 'error', phase: 'report', retryable: false, message});
  }

  output(label: string, value: string): void {
    this.data.outputs.push({label, value});
  }

  private finalizeOutcomes(status: RunStatus): void {
    if (this.data.dryRun) return;
    const interrupted = status === 'cancelled' || status === 'interrupted';
    for (const page of this.data.pages) {
      if (['discovered', 'planned', 'skeleton-created'].includes(page.status)) page.status = 'not-started';
      const dependencyBlocked = page.status === 'blocked' || page.status === 'failed' || page.status === 'conflict';
      const blockedByPageId = page.blockedByPageId ?? page.sourceCanonicalId;
      const blockedByCode = page.blockedByCode ?? (page.status === 'conflict' ? 'destination-ownership-ambiguity' : 'destination-page-unavailable');
      for (const resource of page.resourceItems) {
        if (resource.status !== 'planned') continue;
        if (dependencyBlocked) {
          resource.status = 'blocked';
          resource.blockedByPageId = blockedByPageId;
          resource.blockedByCode = blockedByCode;
          resource.error ??= `Not attempted because destination page ${blockedByPageId} is unavailable`;
        } else {
          resource.status = 'not-started';
          if (!interrupted) resource.error ??= 'Live transfer ended before this file operation started';
        }
      }
      if (page.comments.status !== 'planned') continue;
      if (dependencyBlocked) {
        page.comments.status = 'blocked';
        page.comments.blockedByPageId = blockedByPageId;
        page.comments.blockedByCode = blockedByCode;
        page.comments.error ??= `Not attempted because destination page ${blockedByPageId} is unavailable`;
      } else {
        page.comments.status = 'not-started';
        if (!interrupted) page.comments.error ??= 'Live transfer ended before comment archival started';
      }
    }
  }

  finish(status: RunStatus): void {
    this.data.status = status;
    this.data.finishedAt = new Date().toISOString();
    this.finalizeOutcomes(status);
    const pageById = new Map(this.data.pages.map((page) => [page.sourceCanonicalId, page]));
    this.data.issues = this.issueCollector.list().map((issue): TransferReportIssue => {
      const page = issue.pageId ? pageById.get(issue.pageId) : undefined;
      const resource = issue.resourceId ? page?.resourceItems.find((item) => item.sourceId === issue.resourceId) : undefined;
      const category = issueCategory(issue);
      const objectType = issueObjectType(issue);
      const objectId = issue.objectId ?? issue.resourceId ?? issue.commentId ?? issue.pageId;
      return {
        ...issue,
        category,
        objectType,
        ...(objectId ? {objectId} : {}),
        ...(!issue.rootCauseId && issue.severity === 'error'
          ? {rootCauseId: `${issue.pageId ?? 'run'}:${issue.code}`}
          : issue.blockedByPageId && !issue.rootCauseId
            ? {rootCauseId: `${issue.blockedByPageId}:${issue.blockedByCode ?? 'dependency'}`}
            : {}),
        ...(page ? {pageTitle: page.sourceTitle, pageAnchor: page.sourceCanonicalId} : {}),
        ...(resource ? {resourceName: resource.sourceName} : {}),
        ...(issue.commentId ? {commentLabel: issue.commentId} : {}),
        action: issueAction(issue, category),
      };
    });
    this.data.warnings = this.data.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);
    this.data.errors = this.data.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
    const pageStatusCounts = countRecord(pageStatuses);
    const resourceStatusCounts = countRecord(resourceStatuses);
    const traversalStatusCounts = countRecord(edgeStatuses);
    const commentStatusCounts = countRecord(commentStatuses);
    for (const page of this.data.pages) pageStatusCounts[page.status] += 1;
    const resources = this.data.pages.flatMap((page) => page.resourceItems);
    for (const resource of resources) resourceStatusCounts[resource.status] += 1;
    for (const edge of this.data.edges) traversalStatusCounts[edge.status] += 1;
    for (const page of this.data.pages) commentStatusCounts[page.comments.status] += 1;
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
      excludedPages: this.data.excludedPages.length,
      maximumDepth: this.data.selection.maximumDepth,
      hierarchyGaps: this.data.selection.hierarchyGaps.length,
      hierarchyRepairs: this.data.hierarchyRepairs.length,
      complete: pageStatusCounts.complete,
      partial: pageStatusCounts.partial,
      failed: pageStatusCounts.failed,
      blocked: pageStatusCounts.blocked,
      conflicts: pageStatusCounts.conflict,
      notStartedPages: pageStatusCounts['not-started'],
      unprocessedPages: pageStatusCounts.discovered + pageStatusCounts.planned + pageStatusCounts['skeleton-created'] + pageStatusCounts['not-started'],
      resources: resources.length,
      attachments: resources.filter((resource) => resource.kind === 'attachment').length,
      resourceImages: resources.filter((resource) => resource.kind === 'image').length,
      resourcesComplete: resourceStatusCounts.complete,
      resourcesPartial: resourceStatusCounts.partial,
      resourcesFailed: resourceStatusCounts.failed,
      resourcesBlocked: resourceStatusCounts.blocked,
      resourcesNotStarted: resourceStatusCounts['not-started'],
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
      adaptations: this.issueCollector.count('adaptation'),
      preservedExternalReferences: this.data.pages.reduce((total, page) => total + (page.preservedExternalReferences ?? 0), 0),
      degradations: this.issueCollector.count('degradation'),
      warnings: this.issueCollector.count('warning'),
      errors: this.issueCollector.count('error'),
      rootErrors: this.issueCollector.count('error'),
      dependentPages: pageStatusCounts.blocked,
      dependentFiles: resourceStatusCounts.blocked,
      dependentComments: commentStatusCounts.blocked,
      retryableFailures: this.issueCollector.countRetryableFailures(),
      inventoryComplete: this.data.pages.length > 0 && inventoriedPages === this.data.pages.length,
      inventoriedPages,
      inventoryFailedPages,
      commentThreads: this.data.pages.reduce((total, page) => total + page.comments.threads, 0),
      comments: this.data.pages.reduce((total, page) => total + page.comments.comments, 0),
      commentParticipants: this.data.pages.reduce((total, page) => total + page.comments.participants, 0),
      commentAttachments: this.data.pages.reduce((total, page) => total + page.comments.attachments, 0),
      commentBytes: this.data.pages.reduce((total, page) => total + page.comments.bytes, 0),
      commentStatuses: commentStatusCounts,
      ...(Number.isFinite(started) && Number.isFinite(finished) ? {durationMs: Math.max(0, finished - started)} : {}),
      pageStatuses: pageStatusCounts,
      resourceStatuses: resourceStatusCounts,
      traversalStatuses: traversalStatusCounts,
    };
    const pageOutcomes = Object.values(pageStatusCounts).reduce((total, value) => total + value, 0);
    const resourceOutcomes = Object.values(resourceStatusCounts).reduce((total, value) => total + value, 0);
    if (pageOutcomes !== this.data.summary.pages || resourceOutcomes !== this.data.summary.resources) {
      throw new Error('Report outcome invariant failed: source inventory does not reconcile with exclusive outcomes');
    }
  }

  async write(reportsDirectory: string): Promise<MigrationReportPaths> {
    const directory = path.join(reportsDirectory, this.data.runId);
    await mkdir(directory, {recursive: true, mode: 0o700});
    const json = path.join(directory, 'report.json');
    const html = path.join(directory, 'index.html');
    const jsonTemporary = `${json}.${process.pid}.tmp`;
    const htmlTemporary = `${html}.${process.pid}.tmp`;
    const shell = await loadReportShell();
    const safeData = sanitizedValue(this.data, this.secrets) as TransferReportData;
    const safePreviews = sanitizedValue(Object.fromEntries(this.previews), this.secrets) as Record<string, PreviewPair>;
    const payload: ReportPresentationPayload = {report: safeData, previews: safePreviews};
    await writeFile(jsonTemporary, `${JSON.stringify(safeData, null, 2)}\n`, {mode: 0o600});
    await writeFile(htmlTemporary, injectReportPayload(shell, payload), {mode: 0o600});
    await rename(jsonTemporary, json);
    await rename(htmlTemporary, html);
    return {runId: this.data.runId, directory, html, json};
  }
}
