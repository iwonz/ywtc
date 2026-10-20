import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import PQueue from 'p-queue';
import {createProviderAdapter} from './adapters/factory.js';
import {secretValues, type AppConfig} from './config.js';
import {
  appendGridSnapshots,
  assertDestinationContent,
  emptyRendererFallbackReason,
  normalizePageContent,
  normalizedPreviewHtml,
  rawContentFallback,
  renderedPreviewHtml,
  renderConfluenceStorage,
  renderYfm,
  setSourceResourceBinding,
  sourceResourceBindings,
  verifyDestinationContent,
} from './content-model.js';
import {
  commentAttachmentUses,
  createCommentArchiveZip,
  renderCommentArchive,
  renderCommentArchiveIndex,
  resolveCommentAttachmentReferences,
  verifyCommentArchive,
} from './comments.js';
import {ConfirmedDestinationMissingError, type ConsistencyRetryOptions, verifyConfirmedDestinationPage} from './consistency.js';
import {DestinationOwnershipConflictError, DestinationRevisionConflictError, DestinationTitleConflictError, IncompleteSourceDiscoveryError} from './domain.js';
import type {
  CommentInventory,
  DestinationAdapter,
  DestinationContainer,
  DestinationPage,
  NormalizedDocument,
  PageGraph,
  RenderContext,
  RenderedDocument,
  SourceAdapter,
  SourcePage,
  SourceResource,
  SourceStatus,
  TransferScope,
} from './domain.js';
import {assertTransferCapabilities} from './domain.js';
import {FilesystemExporter, type FilesystemExportResult} from './filesystem-export.js';
import {discoverPageGraph} from './graph.js';
import {HttpRequestError} from './http.js';
import {safeFilename} from './input.js';
import type {Logger} from './logger.js';
import type {DirectoryLocator, RemoteLocator, ResolvedLocator} from './locators.js';
import {profileBaseUrl, sameRemoteInstance} from './locators.js';
import {
  TransferReport,
  type MigrationReportPaths,
  type ReportInventoryStatus,
  type TransferReportPage,
  type TransferReportSummary,
} from './report.js';
import {DestinationNameAllocator, preferredDestinationName, verifiedCacheFile} from './resource-reconciliation.js';
import {destinationTitleCandidates} from './title-allocation.js';
import {
  resolveStateLocation,
  StateStore,
  type BlockingCause,
  type CommentTransferState,
  type EndpointIdentity,
  type PageTransferState,
  type PageTransferStatus,
  type ResourceTransferState,
  type RunStatus,
  type TransferIdentity,
} from './state.js';

export interface TransferOptions {
  source: RemoteLocator;
  destination: ResolvedLocator;
  scope: TransferScope;
  sourceStatus?: SourceStatus;
  comments?: boolean;
  dryRun: boolean;
  archive: boolean;
  fresh?: boolean;
  concurrency: number;
  stateFilename?: string;
  runtimeDirectory: string;
  cacheDirectory: string;
  reportsDirectory: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}

export interface TransferResult {
  status: RunStatus;
  hasErrors: boolean;
  reportPaths: MigrationReportPaths;
  stateId: string;
  stateFilename: string;
  stateBackupFilename?: string;
  output?: string;
  archive?: string;
  summary: TransferReportSummary;
}

function sourceIdentity(locator: RemoteLocator, root: SourcePage): EndpointIdentity {
  return {
    profile: locator.profile.name,
    provider: locator.profile.type,
    instance: profileBaseUrl(locator.profile),
    objectId: root.id,
    ...(root.space ? {containerId: root.space} : {}),
  };
}

function destinationIdentity(locator: RemoteLocator, container: DestinationContainer): EndpointIdentity {
  return {
    profile: locator.profile.name,
    provider: locator.profile.type,
    instance: profileBaseUrl(locator.profile),
    objectId: container.id,
    ...(container.space ? {containerId: container.space} : {}),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceFingerprint(page: SourcePage): string {
  const availability = page.contentAvailability
    ? `${page.contentAvailability.status}:${page.contentAvailability.sourceType}:${page.contentAvailability.reason}`
    : 'available';
  return sha256(`${page.title}\0${page.rawContent}\0${page.version ?? ''}\0${availability}`);
}

function cachedPagePath(cacheDirectory: string, canonicalId: string): string {
  return path.join(cacheDirectory, 'pages', `${sha256(canonicalId)}.json`);
}

function cachedDocumentPath(cacheDirectory: string, canonicalId: string): string {
  return path.join(cacheDirectory, 'documents', `${sha256(canonicalId)}.json`);
}

async function cacheDiscoveredPages(cacheDirectory: string, graph: PageGraph): Promise<Map<string, string>> {
  await mkdir(path.join(cacheDirectory, 'pages'), {recursive: true, mode: 0o700});
  const fingerprints = new Map<string, string>();
  await Promise.all(graph.pages.map(async (page) => {
    fingerprints.set(page.canonicalId, sourceFingerprint(page));
    await writeFile(cachedPagePath(cacheDirectory, page.canonicalId), `${JSON.stringify(page)}\n`, {mode: 0o600});
    page.rawContent = '';
  }));
  return fingerprints;
}

async function loadCachedPage(cacheDirectory: string, canonicalId: string): Promise<SourcePage> {
  return JSON.parse(await readFile(cachedPagePath(cacheDirectory, canonicalId), 'utf8')) as SourcePage;
}

async function cacheDocument(cacheDirectory: string, canonicalId: string, document: NormalizedDocument): Promise<void> {
  const filename = cachedDocumentPath(cacheDirectory, canonicalId);
  await mkdir(path.dirname(filename), {recursive: true, mode: 0o700});
  await writeFile(filename, `${JSON.stringify(document)}\n`, {mode: 0o600});
}

async function loadCachedDocument(cacheDirectory: string, canonicalId: string): Promise<NormalizedDocument> {
  return JSON.parse(await readFile(cachedDocumentPath(cacheDirectory, canonicalId), 'utf8')) as NormalizedDocument;
}

function cachePath(cacheDirectory: string, page: SourcePage, resource: SourceResource): string {
  const pageKey = sha256(page.canonicalId).slice(0, 12);
  const resourceKey = sha256(`${resource.id}:${resource.name}`).slice(0, 12);
  return path.join(cacheDirectory, pageKey, `${resourceKey}-${preferredDestinationName(resource)}`);
}

function containedCachePath(cacheDirectory: string, candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const relative = path.relative(path.resolve(cacheDirectory), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    ? path.resolve(candidate)
    : undefined;
}

function resetResourceDestinations(resources: PageTransferState['resources']): PageTransferState['resources'] {
  return Object.fromEntries(Object.entries(resources).map(([id, resource]) => [id, {
    sourceId: resource.sourceId,
    sourceName: resource.sourceName,
    destinationName: resource.destinationName,
    ...(resource.sha256 ? {sha256: resource.sha256} : {}),
    ...(resource.size !== undefined ? {size: resource.size} : {}),
    ...(resource.cachePath ? {cachePath: resource.cachePath} : {}),
    ...(resource.mimeType ? {mimeType: resource.mimeType} : {}),
    status: 'planned' as const,
    updatedAt: new Date().toISOString(),
  }]));
}

function sourceDerivedTextMatches(expectedBody: string, actualBody: string | undefined, provider: SourcePage['provider'], page: SourcePage): boolean {
  if (actualBody === undefined) return false;
  return verifyDestinationContent(expectedBody, actualBody, provider, page).status === 'complete';
}

const REVISION_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;

async function revisionDelay(
  attempt: number,
  options: ConsistencyRetryOptions,
): Promise<number> {
  const base = REVISION_RETRY_DELAYS_MS[attempt]!;
  const random = options.random ?? Math.random;
  const delay = Math.max(1, Math.round(base * (0.8 + random() * 0.4)));
  await (options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(delay);
  return delay;
}

async function updateMappedPage(input: {
  destination: DestinationAdapter;
  current: DestinationPage;
  title: string;
  body: string;
  sourcePage: SourcePage;
  consistencyOptions: ConsistencyRetryOptions;
  report: TransferReport;
}): Promise<{page: DestinationPage; updated: boolean; normalized: boolean; verification: ReturnType<typeof verifyDestinationContent>}> {
  let current = input.current;
  let title = input.title;
  let retainedMappedTitle = false;
  let forbiddenRetried = false;
  for (let attempt = 0; ; attempt += 1) {
    const verification = verifyDestinationContent(input.body, current.content, input.destination.kind, input.sourcePage);
    if (verification.status === 'complete' && current.title === title) {
      return {page: current, updated: false, normalized: current.content !== input.body, verification};
    }
    try {
      const result = await input.destination.updatePage({page: current, title, body: input.body});
      const confirmed = await verifyConfirmedDestinationPage(input.destination, result, input.consistencyOptions);
      return {
        page: confirmed,
        updated: true,
        normalized: confirmed.content !== input.body,
        verification: verifyDestinationContent(input.body, confirmed.content, input.destination.kind, input.sourcePage),
      };
    } catch (error) {
      if (error instanceof DestinationTitleConflictError && !retainedMappedTitle && current.title !== title) {
        title = current.title;
        retainedMappedTitle = true;
        input.report.issue({
          code: 'mapped-title-retained',
          severity: 'normalization',
          phase: 'page',
          pageId: input.sourcePage.canonicalId,
          retryable: false,
          message: `${input.sourcePage.title}: retained mapped destination title "${current.title}" because the source title is occupied`,
        });
        continue;
      }
      if (error instanceof HttpRequestError && error.status === 403 && !forbiddenRetried) {
        forbiddenRetried = true;
        current = await verifyConfirmedDestinationPage(input.destination, current, input.consistencyOptions);
        const delay = await revisionDelay(0, input.consistencyOptions);
        input.report.issue({
          code: 'destination-update-retry',
          severity: 'normalization',
          phase: 'page',
          pageId: input.sourcePage.canonicalId,
          retryable: true,
          message: `${input.sourcePage.title}: destination rejected a mapped update once; refreshed immutable page ${current.id} and retrying after ${delay} ms`,
        });
        continue;
      }
      if (!(error instanceof DestinationRevisionConflictError) || attempt >= REVISION_RETRY_DELAYS_MS.length) throw error;
      const delay = await revisionDelay(attempt, input.consistencyOptions);
      input.report.issue({
        code: 'destination-revision-retry',
        severity: 'normalization',
        phase: 'page',
        pageId: input.sourcePage.canonicalId,
        retryable: true,
        message: `${input.sourcePage.title}: destination revision changed concurrently; retry ${attempt + 1} after ${delay} ms`,
      });
      current = await verifyConfirmedDestinationPage(input.destination, current, input.consistencyOptions);
    }
  }
}

async function reparentMappedPage(input: {
  destination: DestinationAdapter;
  current: DestinationPage;
  parent: DestinationContainer | DestinationPage;
  sourcePage: SourcePage;
  consistencyOptions: ConsistencyRetryOptions;
  report: TransferReport;
}): Promise<DestinationPage> {
  if (!input.destination.reparentPage) throw new Error(`${input.destination.profile.name} does not implement page moves`);
  let current = input.current;
  for (let attempt = 0; ; attempt += 1) {
    if (current.parentId === input.parent.id) return current;
    try {
      const moved = await input.destination.reparentPage({page: current, parent: input.parent});
      return verifyConfirmedDestinationPage(input.destination, moved, input.consistencyOptions);
    } catch (error) {
      if (!(error instanceof DestinationRevisionConflictError) || attempt >= REVISION_RETRY_DELAYS_MS.length) throw error;
      const delay = await revisionDelay(attempt, input.consistencyOptions);
      input.report.issue({
        code: 'destination-revision-retry',
        severity: 'normalization',
        phase: 'page',
        pageId: input.sourcePage.canonicalId,
        retryable: true,
        message: `${input.sourcePage.title}: destination revision changed during hierarchy repair; retry ${attempt + 1} after ${delay} ms`,
      });
      current = await verifyConfirmedDestinationPage(input.destination, current, input.consistencyOptions);
    }
  }
}

function ambiguousCreateOutcome(error: unknown): boolean {
  return error instanceof HttpRequestError
    && (error.status === undefined || error.status >= 500);
}

async function createPageWithAllocatedTitle(input: {
  destination: DestinationAdapter;
  parent: DestinationContainer | DestinationPage;
  sourcePage: SourcePage;
  bootstrap: RenderedDocument;
  preferredTitle?: string;
  consistencyOptions: ConsistencyRetryOptions;
  report: TransferReport;
}): Promise<{page: DestinationPage; reused: boolean}> {
  const candidates = destinationTitleCandidates(input.sourcePage, input.preferredTitle);
  for (const [index, title] of candidates.entries()) {
    let child: DestinationPage | undefined;
    try {
      child = input.destination.findRecoverablePage
        ? await input.destination.findRecoverablePage(input.parent, title)
        : await input.destination.findChild(input.parent, title);
    } catch (error) {
      input.report.issue({
        code: 'destination-recovery-lookup-failed',
        severity: 'warning',
        phase: 'page',
        pageId: input.sourcePage.canonicalId,
        retryable: true,
        message: `${input.sourcePage.title}: parent-scoped recovery lookup failed for "${title}"; authoritative creation will be attempted: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (child && sourceDerivedTextMatches(input.bootstrap.body, child.content, input.destination.kind, input.sourcePage)) {
      return {page: child, reused: true};
    }
    const occupied = child ?? (input.destination.findTitleConflict
      ? await input.destination.findTitleConflict(input.parent, title)
      : undefined);
    if (occupied) continue;
    let created: DestinationPage;
    try {
      created = await input.destination.createPage({container: input.parent, title, body: input.bootstrap.body});
    } catch (error) {
      if (error instanceof DestinationTitleConflictError) continue;
      if (ambiguousCreateOutcome(error)) {
        const recovered = input.destination.findRecoverablePage
          ? await input.destination.findRecoverablePage(input.parent, title)
          : await input.destination.findChild(input.parent, title);
        if (recovered && sourceDerivedTextMatches(input.bootstrap.body, recovered.content, input.destination.kind, input.sourcePage)) {
          return {page: recovered, reused: true};
        }
      }
      throw error;
    }
    created = await verifyConfirmedDestinationPage(input.destination, created, input.consistencyOptions);
    if (created.parentId !== input.parent.id) {
      throw new Error(`Destination hierarchy verification failed for ${input.sourcePage.title}: expected parent ${input.parent.id}, received ${created.parentId ?? 'none'}`);
    }
    if (index > 0) {
      input.report.issue({
        code: 'destination-title-renamed',
        severity: 'normalization',
        phase: 'page',
        pageId: input.sourcePage.canonicalId,
        retryable: false,
        message: `${input.sourcePage.title}: destination title was allocated as "${created.title}" because an earlier candidate was occupied`,
      });
    }
    return {page: created, reused: false};
  }
  throw new Error(`Confluence rejected all ${candidates.length} deterministic destination titles for ${input.sourcePage.title} because they are occupied`);
}

function destinationFromState(state: PageTransferState, adapter: DestinationAdapter): DestinationPage {
  if (!state.destinationId) {
    throw new Error(`Incomplete mapped destination for ${state.sourceTitle}`);
  }
  return {
    provider: adapter.kind,
    profile: adapter.profile.name,
    id: state.destinationId,
    canonicalId: state.destinationCanonicalId ?? `${adapter.profile.name}:${adapter.kind}:${state.destinationId}`,
    title: state.destinationTitle,
    url: state.destinationLocator ?? state.destinationId,
    locator: state.destinationId,
    ...(state.destinationFingerprint ? {fingerprint: state.destinationFingerprint} : {}),
    ...(state.destinationVersion ? {version: state.destinationVersion} : {}),
  };
}

function reportPage(input: {
  page: SourcePage & {depth: number; projectedParentId?: string};
  destination?: DestinationPage;
  destinationFile?: {id: string; url: string; parentId?: string};
  status: PageTransferStatus;
  inventoryStatus?: ReportInventoryStatus;
  resources: SourceResource[];
  document: NormalizedDocument;
  resourceFallbacks?: Array<{name: string; error: string}>;
  warnings?: string[];
  normalizations?: string[];
  adaptations?: string[];
  preservedExternalReferences?: number;
  resourceStates?: Record<string, ResourceTransferState>;
  resourceStatusOverride?: ResourceTransferState['status'];
  error?: string;
  commentsEnabled?: boolean;
  commentInventory?: CommentInventory | undefined;
  commentState?: CommentTransferState | undefined;
  conflictEvidence?: PageTransferState['conflictEvidence'];
  blockedBy?: Required<Pick<BlockingCause, 'blockedByPageId' | 'blockedByCode'>> & {blockedReason?: string};
}): TransferReportPage {
  const effectiveWarnings = input.warnings ?? input.document.warnings;
  const inventory = input.commentInventory;
  const commentResourceIds = new Set<string>();
  for (const thread of inventory?.threads ?? []) {
    const stack = [thread.root];
    while (stack.length > 0) {
      const entry = stack.pop()!;
      for (const attachment of entry.attachments) {
        if (attachment.resourceId) commentResourceIds.add(attachment.resourceId);
      }
      stack.push(...entry.replies);
    }
  }
  const transferable = input.resources.filter(
    (resource): resource is SourceResource & {kind: 'attachment' | 'image'} => resource.kind !== 'grid',
  );
  const resourceItems = transferable.map((resource) => {
    const state = input.resourceStates?.[resource.id];
    const sourceBytes = state?.size ?? resource.size;
    const status = input.resourceStatusOverride ?? state?.status ?? 'planned';
    return {
      sourceId: resource.id,
      sourceName: resource.name,
      ...(resource.downloadUrl ? {sourceUrl: resource.downloadUrl} : {}),
      ...(resource.referenceAliases?.[0] ? {sourceReference: resource.referenceAliases[0]} : {}),
      kind: commentResourceIds.has(resource.id) ? 'comment-attachment' as const : resource.kind,
      status,
      ...(sourceBytes !== undefined ? {sourceBytes} : {}),
      ...(status === 'complete' && sourceBytes !== undefined ? {transferredBytes: sourceBytes} : {}),
      ...(state?.destinationId ? {destinationId: state.destinationId} : {}),
      ...(state?.destinationName ? {destinationName: state.destinationName} : {}),
      ...(state?.destinationUrl ? {destinationUrl: state.destinationUrl} : {}),
      ...(state?.sha256 ? {sha256: state.sha256} : {}),
      ...(state?.lastError ? {error: state.lastError} : {}),
      ...(status === 'blocked' && input.blockedBy ? input.blockedBy : {}),
    };
  });
  const knownBytes = resourceItems.reduce((total, resource) => total + (resource.sourceBytes ?? 0), 0);
  const transferredBytes = resourceItems.reduce((total, resource) => total + (resource.transferredBytes ?? 0), 0);
  const commentsEnabled = input.commentsEnabled ?? true;
  const commentState = input.commentState;
  const commentStatus = !commentsEnabled
    ? 'skipped' as const
    : commentState?.status
      ?? (inventory?.status === 'failed' ? 'failed' as const : inventory?.status === 'empty' ? 'complete' as const : 'planned' as const);
  const commentError = commentState?.lastError ?? inventory?.error;
  const commentItems = inventory?.threads.flatMap((thread) => {
    const result: NonNullable<TransferReportPage['comments']['items']> = [];
    const visit = (entry: (typeof thread)['root']): void => {
      const author = entry.author.displayName
        ?? entry.author.username
        ?? entry.author.publicName
        ?? entry.author.providerId;
      result.push({
        threadId: thread.id,
        commentId: entry.id,
        ...(entry.parentId ? {parentId: entry.parentId} : {}),
        author,
        ...(entry.createdAt ? {createdAt: entry.createdAt} : {}),
        ...(entry.status ? {sourceStatus: entry.status} : {}),
        outcome: commentStatus,
        sourceUrl: `${input.page.url}#comment-${encodeURIComponent(entry.id)}`,
        ...(commentState?.destinationUrl ? {destinationUrl: commentState.destinationUrl} : {}),
        ...(commentError ? {error: commentError} : {}),
      });
      for (const reply of entry.replies) visit(reply);
    };
    visit(thread.root);
    return result;
  });
  return {
    sourceCanonicalId: input.page.canonicalId,
    sourceId: input.page.id,
    sourceTitle: input.page.title,
    sourceUrl: input.page.url,
    ...(input.page.parentId ? {sourceParentId: input.page.parentId} : {}),
    ...(input.page.ancestorIds?.length ? {sourceAncestorIds: input.page.ancestorIds} : {}),
    ...(input.destination ? {
      destinationId: input.destination.id,
      destinationTitle: input.destination.title,
      destinationUrl: input.destination.url,
      ...(input.destination.parentId ? {destinationParentId: input.destination.parentId} : {}),
    } : {}),
    ...(input.destinationFile ? {
      destinationId: input.destinationFile.id,
      destinationTitle: input.page.title,
      destinationUrl: input.destinationFile.url,
      ...(input.destinationFile.parentId ? {destinationParentId: input.destinationFile.parentId} : {}),
    } : {}),
    ...(input.page.projectedParentId ? {parentId: input.page.projectedParentId, projectedParentId: input.page.projectedParentId} : {}),
    depth: input.page.depth,
    status: input.status,
    inventoryStatus: input.inventoryStatus ?? 'complete',
    resources: transferable.length,
    resourceItems,
    ...(transferable.length === 0 || resourceItems.some((resource) => resource.sourceBytes !== undefined) ? {sourceBytes: knownBytes} : {}),
    transferredBytes,
    bytesUnknown: resourceItems.filter((resource) => resource.sourceBytes === undefined).length,
    links: input.document.metrics.links,
    images: input.document.metrics.images,
    tables: input.document.metrics.tables,
    grids: input.resources.filter((resource) => resource.kind === 'grid').length,
    codeBlocks: input.document.metrics.codeBlocks,
    degraded: effectiveWarnings.length > 0 || (input.resourceFallbacks?.length ?? 0) > 0,
    resourceFallbacks: input.resourceFallbacks ?? [],
    warnings: [...new Set(effectiveWarnings)],
    normalizations: [...new Set([...(input.document.normalizations ?? []), ...(input.normalizations ?? [])])],
    adaptations: [...new Set([...(input.document.adaptations ?? []), ...(input.adaptations ?? [])])],
    preservedExternalReferences: input.preservedExternalReferences ?? input.document.metrics.preservedExternalReferences,
    ...(input.error ? {error: input.error} : {}),
    ...(input.conflictEvidence ? {conflictEvidence: input.conflictEvidence} : {}),
    ...(input.status === 'blocked' && input.blockedBy ? input.blockedBy : {}),
    comments: {
      status: commentStatus,
      threads: commentState?.threads ?? inventory?.threads.length ?? 0,
      comments: commentState?.comments ?? inventory?.comments ?? 0,
      participants: commentState?.participants ?? inventory?.participants ?? 0,
      attachments: commentState?.attachments ?? inventory?.attachments ?? 0,
      bytes: commentState?.bytes ?? inventory?.knownBytes ?? 0,
      ...(commentState?.archiveName ? {archiveName: commentState.archiveName} : {}),
      ...(commentState?.archiveUrl ? {archiveUrl: commentState.archiveUrl} : {}),
      ...(commentState?.destinationId ? {destinationId: commentState.destinationId} : {}),
      ...(commentState?.destinationUrl ? {destinationUrl: commentState.destinationUrl} : {}),
      ...(commentState?.previousDestinationIds?.length ? {revision: true} : {}),
      ...(commentState?.status === 'stale' ? {stale: true} : {}),
      ...(commentError ? {error: commentError} : {}),
      ...(commentState?.preview ? {preview: commentState.preview} : {}),
      ...(commentItems?.length ? {items: commentItems} : {}),
      ...(commentStatus === 'blocked' && input.blockedBy ? input.blockedBy : {}),
    },
  };
}

function blockedResourceStates(
  resources: SourceResource[],
  previous: Record<string, ResourceTransferState>,
  cause: Required<Pick<BlockingCause, 'blockedByPageId' | 'blockedByCode'>> & {blockedReason: string},
): Record<string, ResourceTransferState> {
  return {
    ...previous,
    ...Object.fromEntries(resources.filter((resource) => resource.kind !== 'grid').map((resource) => {
      const existing = previous[resource.id];
      return [resource.id, {
        ...(existing ?? {}),
        sourceId: resource.id,
        sourceName: resource.name,
        destinationName: existing?.destinationName ?? preferredDestinationName(resource),
        ...(existing?.size !== undefined ? {size: existing.size} : resource.size !== undefined ? {size: resource.size} : {}),
        status: 'blocked' as const,
        ...cause,
        lastError: cause.blockedReason,
        updatedAt: new Date().toISOString(),
      }];
    })),
  };
}

function blockedCommentState(
  inventory: CommentInventory | undefined,
  previous: CommentTransferState | undefined,
  cause: Required<Pick<BlockingCause, 'blockedByPageId' | 'blockedByCode'>> & {blockedReason: string},
): CommentTransferState {
  return {
    ...(previous ?? {}),
    status: 'blocked',
    threads: previous?.threads ?? inventory?.threads.length ?? 0,
    comments: previous?.comments ?? inventory?.comments ?? 0,
    participants: previous?.participants ?? inventory?.participants ?? 0,
    attachments: previous?.attachments ?? inventory?.attachments ?? 0,
    bytes: previous?.bytes ?? inventory?.knownBytes ?? 0,
    ...cause,
    lastError: cause.blockedReason,
    updatedAt: new Date().toISOString(),
  };
}

function runStatus(errors: number, warnings: number, degradations: number): RunStatus {
  if (errors > 0) return 'partial';
  return warnings + degradations > 0 ? 'completed-with-warnings' : 'completed';
}

function runOutcomeCounts(summary: TransferReportSummary, pages: number) {
  return {
    pages,
    warnings: summary.warnings,
    degradations: summary.degradations,
    adaptations: summary.adaptations,
    normalizations: summary.normalizations,
    preservedExternalReferences: summary.preservedExternalReferences,
    errors: summary.errors,
    rootErrors: summary.rootErrors,
    dependentPages: summary.dependentPages,
    dependentFiles: summary.dependentFiles,
    dependentComments: summary.dependentComments,
  };
}

export class MigrationRunError extends Error {
  constructor(
    message: string,
    readonly reportPaths: MigrationReportPaths,
    readonly stateFilename: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationRunError';
  }
}

async function renderRemoteDocument(input: {
  destination: DestinationAdapter;
  container: DestinationContainer;
  document: NormalizedDocument;
  page: SourcePage;
  context: RenderContext;
}): Promise<RenderedDocument> {
  try {
    const rendered = input.destination.kind === 'confluence'
      ? await renderConfluenceStorage(input.document, input.page, input.context, input.container.space ?? '')
      : await renderYfm(input.document, input.context);
    if (!rendered.body.trim() && !input.document.semanticallyEmpty) {
      return rawContentFallback(input.page, input.destination.kind, emptyRendererFallbackReason(input.document));
    }
    return rendered;
  } catch (error) {
    return rawContentFallback(input.page, input.destination.kind, error instanceof Error ? error.message : String(error));
  }
}

export class Migrator {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly adapterFactory: typeof createProviderAdapter = createProviderAdapter,
    private readonly consistencyOptions: ConsistencyRetryOptions = {},
  ) {}

  async run(options: TransferOptions): Promise<TransferResult> {
    const sourceStatus = options.sourceStatus ?? 'all';
    const commentsEnabled = options.comments ?? true;
    const source = this.adapterFactory(options.source.profile, this.config);
    const destination = options.destination.type === 'remote'
      ? this.adapterFactory(options.destination.profile, this.config)
      : undefined;
    assertTransferCapabilities(source, destination, options.scope, sourceStatus, commentsEnabled);
    const status = options.onStatus ?? (() => undefined);
    status('Checking source and destination capabilities');
    const [sourcePlatform, destinationPlatform] = await Promise.all([
      source.preflight(),
      destination?.preflight(),
    ]);
    status(`Connected to ${sourcePlatform.product}${destinationPlatform ? ` and ${destinationPlatform.product}` : ''}`);
    const [root, container] = await Promise.all([
      source.resolvePage(options.source.value),
      options.destination.type === 'remote' && destination ? destination.resolveContainer(options.destination.value) : undefined,
    ]);

    const identity: TransferIdentity = {
      source: sourceIdentity(options.source, root),
      destination: options.destination.type === 'directory'
        ? {provider: 'filesystem', path: options.destination.path, format: options.destination.format}
        : destinationIdentity(options.destination, container!),
    };
    const stateLocation = resolveStateLocation(identity, {
      runtimeDirectory: options.runtimeDirectory,
      ...(options.stateFilename ? {stateFilename: options.stateFilename} : {}),
    });
    const store = new StateStore(stateLocation.filename);
    await store.load(identity, {fresh: options.fresh ?? false, dryRun: options.dryRun});
    try {
    if (!options.dryRun) await store.save();
    const run = await store.beginRun(options.scope, options.dryRun, sourceStatus, commentsEnabled);
    const report = new TransferReport({
      secrets: secretValues(this.config),
      dryRun: options.dryRun,
      commentsEnabled,
      scope: options.scope,
      sourceStatus,
      direction: `${source.kind} → ${options.destination.type === 'directory' ? options.destination.format : destination!.kind}`,
      source: {provider: source.kind, profile: source.profile.name, rootId: root.id, title: root.title, url: root.url},
      destination: options.destination.type === 'directory'
        ? {provider: 'filesystem', id: options.destination.path, format: options.destination.format}
        : {provider: destination!.kind, profile: destination!.profile.name, id: container!.id, url: container!.url},
      state: {
        id: stateLocation.id,
        path: stateLocation.filename,
        mode: stateLocation.mode,
        source: store.loadInfo.source,
        ...(store.loadInfo.backupFilename ? {backupPath: store.loadInfo.backupFilename} : {}),
      },
    });
    report.registerPages([{...root, depth: 0}]);

    let graph: PageGraph;
    let sourceFingerprints: Map<string, string>;
    try {
      status(`Discovering ${options.scope} scope from ${root.title}`);
      graph = await discoverPageGraph({
        adapter: source,
        root,
        scope: options.scope,
        sourceStatus,
        ...(options.signal ? {signal: options.signal} : {}),
        onProgress: (progress) => status(`Discovery: ${progress.pages} pages, ${progress.edges} links${progress.active ? ` · ${progress.active}` : ''}`),
      });
      report.registerPages(graph.pages);
      report.setEdges(graph.edges);
      report.setSelection(graph.selection);
      await store.setRunSelection(run.id, graph.selection);
      for (const warning of graph.warnings) report.warning(warning);
      if (
        container
        && options.destination.type === 'remote'
        && sameRemoteInstance(options.source.profile, options.destination.profile)
        && graph.pages.some((page) => page.id === container.id)
      ) {
        throw new Error('The destination page belongs to the selected source graph. Choose a destination outside the transferred graph.');
      }
      status(`Source tree: root ${root.title} · ${graph.selection.returnedDescendants} descendants returned · ${graph.selection.selectedDescendants} selected · ${graph.selection.excluded.length} excluded · depth ${graph.selection.maximumDepth}`);
      status(`Caching source content for ${graph.pages.length} pages`);
      sourceFingerprints = await cacheDiscoveredPages(options.cacheDirectory, graph);
      await store.setGraph(graph.rootId, graph.edges);
    } catch (error) {
      const finalStatus: RunStatus = options.signal?.aborted ? 'cancelled' : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof IncompleteSourceDiscoveryError) {
        report.registerPages(error.pages);
        report.setSelection(error.selection);
        await store.setRunSelection(run.id, error.selection);
        const failures = new Map(error.failures.map((failure) => [failure.page.canonicalId, failure]));
        for (const page of error.pages) {
          const failure = failures.get(page.canonicalId);
          report.updatePage(page.canonicalId, {
            status: failure ? 'failed' : 'not-started',
            inventoryStatus: failure ? 'failed' : 'pending',
            ...(failure ? {error: failure.message} : {}),
            comments: {
              status: commentsEnabled ? 'not-started' : 'skipped',
              threads: 0,
              comments: 0,
              participants: 0,
              attachments: 0,
              bytes: 0,
            },
          });
          if (failure) report.issue({
            code: failure.code,
            severity: 'error',
            phase: 'discovery',
            pageId: page.canonicalId,
            retryable: failure.retryable,
            message: `${page.title}: ${failure.message}`,
          });
        }
      } else {
        report.updatePage(root.canonicalId, {status: 'failed', inventoryStatus: 'failed', error: message});
        report.issue({
          code: 'source-discovery-failed',
          severity: 'error',
          phase: 'discovery',
          pageId: root.canonicalId,
          retryable: error instanceof HttpRequestError && (error.status === 429 || (error.status ?? 0) >= 500),
          message,
        });
      }
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, runOutcomeCounts(report.data.summary, report.data.summary.pages));
      throw new MigrationRunError(message, reportPaths, stateLocation.filename, {cause: error});
    }

    const resourcesByPage = new Map<string, SourceResource[]>();
    const commentsByPage = new Map<string, CommentInventory>();
    const inventoryQueue = new PQueue({concurrency: options.concurrency});
    const inventory = {resources: 0, bytes: 0, unknownSizes: 0, grids: 0, links: 0, images: 0, tables: 0, codeBlocks: 0, commentThreads: 0, comments: 0, commentParticipants: 0, commentAttachments: 0, commentBytes: 0};
    status(`Inspecting content and resources for ${graph.pages.length} pages`);
    const inventoryErrors: string[] = [];
    await Promise.all(graph.pages.map((page) => inventoryQueue.add(async () => {
      try {
        if (options.signal?.aborted) throw options.signal.reason ?? new Error('Transfer cancelled');
        const cachedPage = await loadCachedPage(options.cacheDirectory, page.canonicalId);
        const resources = await source.listResources(page);
        resourcesByPage.set(page.canonicalId, resources);
        let commentInventory: CommentInventory | undefined;
        if (commentsEnabled) {
          try {
            if (!source.readComments) throw new Error(`${source.profile.name} does not implement comment reads`);
            commentInventory = await source.readComments(cachedPage);
            resolveCommentAttachmentReferences(commentInventory, resources);
            commentsByPage.set(page.canonicalId, commentInventory);
            inventory.commentThreads += commentInventory.threads.length;
            inventory.comments += commentInventory.comments;
            inventory.commentParticipants += commentInventory.participants;
            inventory.commentAttachments += commentInventory.attachments;
            inventory.commentBytes += commentInventory.knownBytes;
            for (const warning of commentInventory.warnings) report.issue({
              code: `comment-inventory-warning:${warning}`,
              severity: 'warning',
              phase: 'inventory',
              pageId: page.canonicalId,
              retryable: false,
              message: `${page.title}: ${warning}`,
            });
          } catch (error) {
            const message = `${page.title}: comments could not be read: ${error instanceof Error ? error.message : String(error)}`;
            commentInventory = {status: 'failed', threads: [], comments: 0, participants: 0, attachments: 0, knownBytes: 0, unknownSizes: 0, warnings: [], error: message};
            commentsByPage.set(page.canonicalId, commentInventory);
            report.issue({code: 'comment-inventory-failed', severity: 'error', phase: 'inventory', pageId: page.canonicalId, retryable: true, message});
          }
        }
        const document = appendGridSnapshots(normalizePageContent(cachedPage), resources);
        await cacheDocument(
          options.cacheDirectory,
          page.canonicalId,
          document,
        );
        inventory.resources += resources.filter((resource) => resource.kind !== 'grid').length;
        inventory.bytes += resources.reduce((total, resource) => total + (resource.size ?? 0), 0);
        inventory.unknownSizes += resources.filter((resource) => resource.kind !== 'grid' && resource.size === undefined).length;
        inventory.grids += resources.filter((resource) => resource.kind === 'grid').length;
        inventory.links += document.metrics.links;
        inventory.images += document.metrics.images;
        inventory.tables += document.metrics.tables;
        inventory.codeBlocks += document.metrics.codeBlocks;
        report.addPage(reportPage({
          page,
          status: 'planned',
          resources,
          document,
          commentsEnabled,
          ...(commentInventory ? {commentInventory} : {}),
        }), undefined, false);
        status(`Inspected ${page.title} · ${resources.length} resources`);
      } catch (error) {
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        inventoryErrors.push(message);
        report.updatePage(page.canonicalId, {status: 'failed', inventoryStatus: 'failed', error: message});
        report.issue({
          code: 'source-inventory-failed',
          severity: 'error',
          phase: 'inventory',
          pageId: page.canonicalId,
          retryable: true,
          message,
        });
      }
    })));
    await store.setRunComments(run.id, {threads: inventory.commentThreads, comments: inventory.comments, attachments: inventory.commentAttachments});
    if (inventoryErrors.length > 0) {
      const finalStatus: RunStatus = options.signal?.aborted ? 'cancelled' : 'failed';
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, runOutcomeCounts(report.data.summary, graph.pages.length));
      throw new MigrationRunError('Resource preflight failed before destination mutation', reportPaths, stateLocation.filename);
    }
    if (!options.dryRun) {
      for (const page of graph.pages) {
        if (store.value.pages[page.canonicalId]) continue;
        const commentInventory = commentsByPage.get(page.canonicalId);
        const commentState: CommentTransferState | undefined = !commentsEnabled
          ? {status: 'skipped', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0, updatedAt: new Date().toISOString()}
          : commentInventory?.status === 'empty'
            ? {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0, updatedAt: new Date().toISOString()}
            : commentInventory?.status === 'failed'
              ? {
                status: 'failed', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0,
                ...(commentInventory.error ? {lastError: commentInventory.error} : {}), updatedAt: new Date().toISOString(),
              }
              : commentInventory
                ? {
                  status: 'planned', ...(commentInventory.fingerprint ? {fingerprint: commentInventory.fingerprint} : {}),
                  threads: commentInventory.threads.length, comments: commentInventory.comments,
                  participants: commentInventory.participants, attachments: commentInventory.attachments,
                  bytes: commentInventory.knownBytes, updatedAt: new Date().toISOString(),
                }
                : undefined;
        const resourceStates = Object.fromEntries((resourcesByPage.get(page.canonicalId) ?? [])
          .filter((resource) => resource.kind !== 'grid')
          .map((resource) => [resource.id, {
            sourceId: resource.id,
            sourceName: resource.name,
            destinationName: preferredDestinationName(resource),
            ...(resource.size !== undefined ? {size: resource.size} : {}),
            ...(resource.mimeType ? {mimeType: resource.mimeType} : {}),
            status: 'planned' as const,
            updatedAt: new Date().toISOString(),
          }]));
        await store.setPage({
          sourceId: page.id,
          sourceCanonicalId: page.canonicalId,
          sourceLocator: page.locator,
          sourceTitle: page.title,
          ...(page.projectedParentId ? {projectedParentId: page.projectedParentId} : {}),
          destinationTitle: page.title,
          sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
          status: 'discovered',
          resources: resourceStates,
          ...(commentState ? {comments: commentState} : {}),
          degradations: [],
          updatedAt: new Date().toISOString(),
        });
      }
    }
    const planSummary = `Plan ready: root + ${graph.selection.selectedDescendants}/${graph.selection.returnedDescendants} descendants (${graph.selection.excluded.length} excluded, depth ${graph.selection.maximumDepth}) · ${graph.pages.length} pages · ${inventory.resources} files (${inventory.bytes} known bytes${inventory.unknownSizes > 0 ? ` · ${inventory.unknownSizes} sizes unknown` : ''}) · ${inventory.links} links · ${inventory.images} images · ${inventory.tables} tables (${inventory.grids} grids) · ${inventory.codeBlocks} code blocks · ${commentsEnabled ? `${inventory.commentThreads} comment threads / ${inventory.comments} entries / ${inventory.commentAttachments} files (${inventory.commentBytes} known bytes)` : 'comments skipped'}`;
    status(planSummary);
    this.logger.info(planSummary);

    let output: string | undefined;
    let archive: string | undefined;
    try {
      if (options.destination.type === 'directory') {
        const result = await this.exportFilesystem(source, graph, options.destination, options, stateLocation.id, store, report, sourceFingerprints, resourcesByPage, commentsByPage);
        output = result.directory;
        archive = result.archive;
        const exportEntry = path.join(result.directory, options.destination.format === 'html' ? 'index.html' : 'index.md');
        report.setDestinationUrl(pathToFileURL(exportEntry).toString());
        report.output('directory', result.directory);
        if (result.archive) report.output('archive', result.archive);
        if (result.backup) report.output('backup', result.backup);
      } else {
        await this.transferRemote({
          source,
          destination: destination!,
          container: container!,
          graph,
          options,
          store,
          report,
          sourceFingerprints,
          resourcesByPage,
          commentsByPage,
        });
        output = container!.url;
        report.output('destination', container!.url);
      }
      report.finish('completed');
      const finalStatus = runStatus(report.data.summary.errors, report.data.summary.warnings, report.data.summary.degradations);
      await store.finalizeOutcomes(graph.pages.map((page) => page.canonicalId), finalStatus, options.dryRun);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, runOutcomeCounts(report.data.summary, graph.pages.length));
      status(`${finalStatus}: source ${report.data.summary.pages} pages · ${report.data.summary.complete} complete · ${report.data.summary.partial} partial · ${report.data.summary.failed + report.data.summary.blocked} failed/blocked · files ${report.data.summary.resourcesComplete}/${report.data.summary.resources} complete · ${report.data.summary.errors} errors · ${report.data.summary.warnings} warnings · ${report.data.summary.degradations} degradations`);
      return {
        status: finalStatus,
        hasErrors: report.data.summary.errors > 0,
        reportPaths,
        stateId: stateLocation.id,
        stateFilename: stateLocation.filename,
        ...(store.loadInfo.backupFilename ? {stateBackupFilename: store.loadInfo.backupFilename} : {}),
        ...(output ? {output} : {}),
        ...(archive ? {archive} : {}),
        summary: report.data.summary,
      };
    } catch (error) {
      const cancelled = options.signal?.aborted;
      const finalStatus: RunStatus = cancelled ? 'cancelled' : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      report.error(message);
      await store.finalizeOutcomes(graph.pages.map((page) => page.canonicalId), finalStatus, options.dryRun);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, runOutcomeCounts(report.data.summary, graph.pages.length));
      this.logger.error(`${message}. Report: ${reportPaths.html}`);
      throw new MigrationRunError(message, reportPaths, stateLocation.filename, {cause: error});
    }
    } finally {
      await store.release();
    }
  }

  private async exportFilesystem(
    source: SourceAdapter,
    graph: PageGraph,
    destination: DirectoryLocator,
    options: TransferOptions,
    identity: string,
    store: StateStore,
    report: TransferReport,
    sourceFingerprints: Map<string, string>,
    resourcesByPage: Map<string, SourceResource[]>,
    commentsByPage: Map<string, CommentInventory>,
  ): Promise<FilesystemExportResult> {
    const exporter = new FilesystemExporter(source, options.concurrency);
    const totalResources = [...resourcesByPage.values()].reduce(
      (total, resources) => total + resources.filter((resource) => resource.kind !== 'grid').length,
      0,
    );
    const total = Math.max(1, graph.pages.length + totalResources);
    let processed = 0;
    const result = await exporter.export({
      graph,
      directory: destination.path,
      format: destination.format,
      identity,
      archive: options.archive,
      dryRun: options.dryRun,
      cacheDirectory: options.cacheDirectory,
      ...(options.signal ? {signal: options.signal} : {}),
      ...(options.onStatus ? {onItem: (message: string) => {
        processed += 1;
        options.onStatus?.(`Progress ${Math.min(100, Math.floor((processed / total) * 100))}% · ${processed}/${total} · ${message}`);
      }} : {}),
      resourcesByPage,
      commentsByPage,
      commentsEnabled: options.comments ?? true,
      loadPage: (page) => loadCachedPage(options.cacheDirectory, page.canonicalId),
      loadDocument: (page) => loadCachedDocument(options.cacheDirectory, page.canonicalId),
    });
    for (const page of graph.pages) {
      const document = await loadCachedDocument(options.cacheDirectory, page.canonicalId);
      const manifestPage = result.manifest.pages.find((item) => item.sourceCanonicalId === page.canonicalId);
      const previous = store.value.pages[page.canonicalId];
      const sourceResources = resourcesByPage.get(page.canonicalId) ?? [];
      const transferableResources = sourceResources.filter((resource) => resource.kind !== 'grid');
      const resources = Object.fromEntries((manifestPage?.resources ?? []).map((resource, index) => {
        const sourceResource = transferableResources[index];
        const sourceId = sourceResource?.id ?? String(index);
        return [sourceId, {
        sourceId,
        sourceName: sourceResource?.name ?? resource.name,
        destinationId: resource.path,
        destinationName: resource.name,
        destinationUrl: pathToFileURL(path.join(destination.path, resource.path)).toString(),
        ...(resource.sha256 ? {sha256: resource.sha256} : {}),
        ...(resource.size !== undefined ? {size: resource.size} : {}),
        status: options.dryRun ? 'planned' as const : 'complete' as const,
        updatedAt: new Date().toISOString(),
      }];
      }));
      const commentIncomplete = manifestPage?.comments && !['complete', 'skipped'].includes(manifestPage.comments.status);
      const pageStatus: PageTransferStatus = options.dryRun ? 'planned' : manifestPage?.degraded || commentIncomplete ? 'partial' : 'complete';
      await store.setPage({
        sourceId: page.id,
        sourceCanonicalId: page.canonicalId,
        sourceLocator: page.locator,
        sourceTitle: page.title,
        ...(page.projectedParentId ? {projectedParentId: page.projectedParentId} : {}),
        ...(manifestPage?.path || previous?.destinationId ? {destinationId: manifestPage?.path ?? previous!.destinationId!} : {}),
        ...(manifestPage?.path || previous?.destinationCanonicalId ? {destinationCanonicalId: manifestPage?.path ? `filesystem:${manifestPage.path}` : previous!.destinationCanonicalId!} : {}),
        ...(manifestPage || previous?.destinationLocator ? {destinationLocator: manifestPage ? path.join(destination.path, manifestPage.path) : previous!.destinationLocator!} : {}),
        destinationTitle: page.title,
        sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
        ...(manifestPage || previous?.destinationFingerprint ? {destinationFingerprint: manifestPage ? sha256(JSON.stringify(manifestPage)) : previous!.destinationFingerprint!} : {}),
        status: pageStatus,
        resources,
        degradations: manifestPage?.warnings ?? [],
        adaptations: manifestPage?.adaptations ?? [],
        ...(manifestPage?.comments ? {comments: {
          status: manifestPage.comments.status,
          ...(manifestPage.comments.fingerprint ? {fingerprint: manifestPage.comments.fingerprint} : {}),
          ...(manifestPage.comments.archivePath ? {archivePath: manifestPage.comments.archivePath} : {}),
          ...(manifestPage.comments.archiveName ? {archiveName: manifestPage.comments.archiveName} : {}),
          threads: manifestPage.comments.threads,
          comments: manifestPage.comments.comments,
          participants: manifestPage.comments.participants,
          attachments: manifestPage.comments.attachments,
          bytes: manifestPage.comments.bytes,
          ...(manifestPage.comments.error ? {lastError: manifestPage.comments.error} : {}),
          updatedAt: new Date().toISOString(),
        }} : {}),
        updatedAt: new Date().toISOString(),
      });
      const parentManifestPage = manifestPage?.parentId
        ? result.manifest.pages.find((item) => item.sourceCanonicalId === manifestPage.parentId)
        : undefined;
      report.addPage(reportPage({
        page,
        ...(manifestPage ? {destinationFile: {
          id: manifestPage.path,
          url: pathToFileURL(path.join(destination.path, manifestPage.path)).toString(),
          ...(parentManifestPage ? {parentId: parentManifestPage.path} : {}),
        }} : {}),
        status: pageStatus,
        resources: sourceResources,
        document,
        resourceStates: resources,
        ...(options.dryRun ? {resourceStatusOverride: 'planned'} : {}),
        ...(manifestPage?.warnings ? {warnings: manifestPage.warnings} : {}),
        ...(manifestPage?.adaptations ? {adaptations: manifestPage.adaptations} : {}),
        preservedExternalReferences: manifestPage?.preservedExternalReferences ?? 0,
        commentsEnabled: options.comments ?? true,
        ...(commentsByPage.get(page.canonicalId) ? {commentInventory: commentsByPage.get(page.canonicalId)} : {}),
        ...(manifestPage?.comments ? {commentState: {
          status: manifestPage.comments.status,
          ...(manifestPage.comments.fingerprint ? {fingerprint: manifestPage.comments.fingerprint} : {}),
          ...(manifestPage.comments.archivePath ? {archivePath: manifestPage.comments.archivePath} : {}),
          ...(manifestPage.comments.archiveName ? {archiveName: manifestPage.comments.archiveName} : {}),
          threads: manifestPage.comments.threads,
          comments: manifestPage.comments.comments,
          participants: manifestPage.comments.participants,
          attachments: manifestPage.comments.attachments,
          bytes: manifestPage.comments.bytes,
          ...(manifestPage.comments.error ? {lastError: manifestPage.comments.error} : {}),
          updatedAt: new Date().toISOString(),
        }} : {}),
      }), {source: normalizedPreviewHtml(document), destination: normalizedPreviewHtml(document)});
      if (
        manifestPage?.comments
        && !['complete', 'skipped', 'planned'].includes(manifestPage.comments.status)
        && !(manifestPage.comments.status === 'failed' && commentsByPage.get(page.canonicalId)?.status === 'failed')
        && !(manifestPage.comments.status === 'partial' && (commentsByPage.get(page.canonicalId)?.warnings.length ?? 0) > 0)
      ) {
        report.issue({
          code: `comment-${manifestPage.comments.status}`,
          severity: manifestPage.comments.status === 'partial' || manifestPage.comments.status === 'stale' ? 'degradation' : 'error',
          phase: 'comment',
          pageId: page.canonicalId,
          retryable: manifestPage.comments.status === 'failed',
          message: `${page.title}: ${manifestPage.comments.error ?? `comment archive is ${manifestPage.comments.status}`}`,
        });
      }
    }
    for (const warning of result.warnings) report.warning(warning);
    for (const error of result.errors) report.error(error);
    return result;
  }

  private async transferRemoteComments(input: {
    source: SourceAdapter;
    destination: DestinationAdapter;
    page: SourcePage;
    destinationPage: DestinationPage;
    inventory: CommentInventory | undefined;
    resources: SourceResource[];
    pageState: PageTransferState;
    cacheDirectory: string;
    dryRun: boolean;
    destinationPages: Map<string, DestinationPage>;
    sourcePages: Map<string, SourcePage>;
    report: TransferReport;
    store: StateStore;
    signal?: AbortSignal;
  }): Promise<CommentTransferState> {
    const {source, destination, page, destinationPage, inventory, resources, pageState, report, store} = input;
    const now = (): string => new Date().toISOString();
    const counts = {
      threads: inventory?.threads.length ?? 0,
      comments: inventory?.comments ?? 0,
      participants: inventory?.participants ?? 0,
      attachments: inventory?.attachments ?? 0,
      bytes: inventory?.knownBytes ?? 0,
    };
    if (!inventory) return {status: 'skipped', ...counts, updatedAt: now()};
    if (inventory.status === 'failed') {
      return {status: 'failed', ...counts, ...(inventory.error ? {lastError: inventory.error} : {}), updatedAt: now()};
    }
    if (inventory.status === 'empty') {
      if (pageState.comments?.destinationId) {
        return {...pageState.comments, status: 'stale', lastError: 'Source no longer returns the previously archived comments; the destination archive was preserved.', updatedAt: now()};
      }
      return {status: 'complete', ...counts, updatedAt: now()};
    }
    const fingerprint = inventory.fingerprint;
    if (!fingerprint) return {status: 'failed', ...counts, lastError: 'Comment inventory fingerprint is missing', updatedAt: now()};
    if (input.dryRun) return {status: 'planned', fingerprint, ...counts, updatedAt: now()};
    if (!destination.createArchiveComment || !destination.readArchiveComment) {
      return {status: 'failed', fingerprint, ...counts, lastError: `${destination.profile.name} does not implement comment archive writes`, updatedAt: now()};
    }

    try {
      if (input.signal?.aborted) throw input.signal.reason ?? new Error('Transfer cancelled');
      const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
      const downloads = new Map<string, {path: string; size: number; sha256: string}>();
      const archiveFiles = [] as Array<{commentId: string; reference: string; originalName: string; path: string; size: number; sha256: string}>;
      for (const use of commentAttachmentUses(inventory)) {
        if (input.signal?.aborted) throw input.signal.reason ?? new Error('Transfer cancelled');
        const resourceId = use.reference.resourceId;
        if (!resourceId) continue;
        const resource = resourceById.get(resourceId);
        if (!resource) continue;
        let downloaded = downloads.get(resourceId);
        if (!downloaded) {
          const resourceState = pageState.resources[resourceId];
          const filename = containedCachePath(input.cacheDirectory, resourceState?.cachePath)
            ?? cachePath(input.cacheDirectory, page, resource);
          const cached = await verifiedCacheFile(filename, resourceState?.sha256 ? {
            sha256: resourceState.sha256,
            ...(resourceState.size !== undefined ? {size: resourceState.size} : {}),
          } : undefined);
          downloaded = cached ?? await source.downloadResource(resource, filename);
          downloads.set(resourceId, downloaded);
        }
        archiveFiles.push({
          commentId: use.commentId,
          reference: use.reference.href,
          originalName: resource.preferredName ?? resource.name,
          ...downloaded,
        });
      }
      const zip = await createCommentArchiveZip({
        pageKey: page.id,
        fingerprint,
        files: archiveFiles,
        destinationDirectory: path.join(input.cacheDirectory, 'comments', sha256(page.canonicalId).slice(0, 16)),
      });
      let current: import('./domain.js').DestinationComment | undefined;
      const previous = pageState.comments;
      if (previous?.destinationId) {
        try {
          current = await destination.readArchiveComment({page: destinationPage, commentId: previous.destinationId});
        } catch (error) {
          report.issue({
            code: 'comment-mapping-missing', severity: 'warning', phase: 'comment', pageId: page.canonicalId,
            retryable: true, message: `${page.title}: mapped comment ${previous.destinationId} could not be read and will be recreated: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      current ??= await destination.findArchiveComment?.(destinationPage, fingerprint);

      let remoteResources = await destination.listUploadedResources(destinationPage);
      const remoteMatches = async (
        remote: (typeof remoteResources)[number],
        file: {path: string; size: number; sha256: string},
        trustedMapping: boolean,
      ): Promise<boolean> => {
        if (remote.size !== undefined && remote.size !== file.size) return false;
        if (!destination.downloadUploadedResource) return trustedMapping && (remote.size === undefined || remote.size === file.size);
        const comparison = `${file.path}.destination-${sha256(remote.id).slice(0, 8)}`;
        try {
          const actual = await destination.downloadUploadedResource({page: destinationPage, resource: remote, destination: comparison});
          return actual.size === file.size && actual.sha256 === file.sha256;
        } finally {
          await rm(comparison, {force: true});
        }
      };
      const uploadArchive = async (file: {path: string; name: string; size: number; sha256: string}, mappedId?: string, mimeType?: string) => {
        const mapped = mappedId ? remoteResources.find((resource) => resource.id === mappedId) : undefined;
        const byName = remoteResources.find((resource) => resource.name.toLocaleLowerCase() === file.name.toLocaleLowerCase());
        const reusable = mapped && await remoteMatches(mapped, file, true)
          ? mapped
          : byName && await remoteMatches(byName, file, false) ? byName : undefined;
        if (reusable) return reusable;
        const extension = path.extname(file.name);
        const base = file.name.slice(0, file.name.length - extension.length);
        let lastError: unknown;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const uploadName = attempt === 0 && !mapped && !byName
            ? file.name
            : `${base}-${file.sha256.slice(0, Math.min(file.sha256.length, 8 + attempt * 2))}${extension}`;
          const occupied = remoteResources.find((resource) => resource.name.toLocaleLowerCase() === uploadName.toLocaleLowerCase());
          if (occupied && await remoteMatches(occupied, file, false)) return occupied;
          if (occupied) continue;
          try {
            const uploaded = await destination.uploadResource({
              page: destinationPage,
              name: uploadName,
              filePath: file.path,
              size: file.size,
              ...(mimeType ? {mimeType} : {}),
            });
            remoteResources.push(uploaded);
            return uploaded;
          } catch (error) {
            lastError = error;
            remoteResources = await destination.listUploadedResources(destinationPage);
            const uncertain = remoteResources.find((resource) => resource.name.toLocaleLowerCase() === uploadName.toLocaleLowerCase());
            if (uncertain && await remoteMatches(uncertain, file, false)) return uncertain;
          }
        }
        throw new Error(`Archive upload could not be reconciled after 10 deterministic names: ${lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown provider response')}`);
      };

      const archiveResource = zip
        ? await uploadArchive(zip, previous?.archiveResourceId, 'application/zip')
        : undefined;
      if (input.signal?.aborted) throw input.signal.reason ?? new Error('Transfer cancelled');
      const attachmentNames = new Map<string, string>();
      if (zip) {
        const nameByHash = new Map(zip.files.map((entry) => [entry.sha256, entry.archiveName]));
        for (const [resourceId, downloaded] of downloads) {
          const name = nameByHash.get(downloaded.sha256);
          if (name) attachmentNames.set(resourceId, name);
        }
      }
      const render = (presentation: 'native' | 'quote' | 'code', replaces?: string): string => renderCommentArchive(inventory, destination.kind, {
        sourceUrl: page.url,
        ...(zip ? {archiveName: archiveResource?.name ?? zip.name, archiveHref: archiveResource?.url ?? archiveResource?.name ?? zip.name} : {}),
        ...(replaces ? {archiveReplaces: replaces} : {}),
        attachmentNames,
        pages: input.destinationPages,
        sourcePages: input.sourcePages,
        presentation,
      });
      const archiveState = zip ? {
        ...(archiveResource ? {archiveResourceId: archiveResource.id} : {}),
        archiveName: archiveResource?.name ?? zip.name,
        ...(archiveResource?.url ? {archiveUrl: archiveResource.url} : {}),
        archivePath: zip.path,
        archiveSha256: zip.sha256,
      } : {};
      const replacement = destination.capabilities.updateComments ? undefined : current?.id;
      let expectedBody = render('native', replacement);
      let fallbackReason: string | undefined;
      let fullArchiveState: Pick<CommentTransferState, 'fullArchiveResourceId' | 'fullArchiveName' | 'fullArchivePath' | 'fullArchiveSha256'> = {};
      const maximumInlineBytes = 1_000_000;
      const prepareFullArchive = async (reason: string): Promise<void> => {
        if (fullArchiveState.fullArchiveName) return;
        const fullBody = renderCommentArchive(inventory, 'markdown', {
          sourceUrl: page.url,
          ...(zip ? {archiveName: archiveResource?.name ?? zip.name, archiveHref: archiveResource?.url ?? archiveResource?.name ?? zip.name} : {}),
          ...(replacement ? {archiveReplaces: replacement} : {}),
          attachmentNames,
          pages: input.destinationPages,
          sourcePages: input.sourcePages,
        });
        const fullArchiveName = `ywtc-comments-${safeFilename(page.id)}-${fingerprint.slice(0, 12)}.md`;
        const fullArchivePath = path.join(input.cacheDirectory, 'comments', sha256(page.canonicalId).slice(0, 16), fullArchiveName);
        await mkdir(path.dirname(fullArchivePath), {recursive: true, mode: 0o700});
        await writeFile(fullArchivePath, `${fullBody}\n`, {mode: 0o600});
        const fullArchiveSha256 = sha256(`${fullBody}\n`);
        const fullArchiveResource = await uploadArchive({
          path: fullArchivePath,
          name: fullArchiveName,
          size: Buffer.byteLength(`${fullBody}\n`),
          sha256: fullArchiveSha256,
        }, previous?.fullArchiveResourceId, 'text/markdown');
        const destinationFullArchiveName = fullArchiveResource.name;
        expectedBody = renderCommentArchiveIndex(inventory, destination.kind, {
          sourceUrl: page.url,
          fullArchiveName: destinationFullArchiveName,
          fullArchiveHref: fullArchiveResource.url ?? destinationFullArchiveName,
          ...(zip ? {archiveName: archiveResource?.name ?? zip.name, archiveHref: archiveResource?.url ?? archiveResource?.name ?? zip.name} : {}),
        });
        fullArchiveState = {
          fullArchiveResourceId: fullArchiveResource.id,
          fullArchiveName: destinationFullArchiveName,
          fullArchivePath,
          fullArchiveSha256,
        };
        fallbackReason = reason;
      };
      if (Buffer.byteLength(expectedBody) > maximumInlineBytes) {
        await prepareFullArchive(`Full comment archive exceeded ${maximumInlineBytes} inline bytes and was attached as Markdown.`);
      }
      let result = current;
      const verifies = (comment: import('./domain.js').DestinationComment | undefined): boolean => {
        if (!comment) return false;
        const verification = verifyCommentArchive(fullArchiveState.fullArchiveName ? fingerprint : inventory, comment.body, archiveResource?.name);
        if (fullArchiveState.fullArchiveName && !comment.body.includes(fullArchiveState.fullArchiveName)) return false;
        return verification.ok && verifyDestinationContent(expectedBody, comment.body, destination.kind, page).status === 'complete';
      };
      const requiresWrite = !verifies(result);
      if (requiresWrite) {
        const write = async (body: string) => {
          if (input.signal?.aborted) throw input.signal.reason ?? new Error('Transfer cancelled');
          if (!result || !destination.capabilities.updateComments || !destination.updateArchiveComment) {
            return destination.createArchiveComment!({page: destinationPage, body});
          }
          let currentComment = result;
          for (let attempt = 0; ; attempt += 1) {
            try {
              return await destination.updateArchiveComment({comment: currentComment, body});
            } catch (error) {
              if (!(error instanceof DestinationRevisionConflictError) || attempt >= REVISION_RETRY_DELAYS_MS.length) throw error;
              const delay = await revisionDelay(attempt, this.consistencyOptions);
              report.issue({
                code: 'destination-comment-revision-retry',
                severity: 'normalization',
                phase: 'comment',
                pageId: page.canonicalId,
                commentId: currentComment.id,
                retryable: true,
                message: `${page.title}: comment archive revision changed concurrently; retry ${attempt + 1} after ${delay} ms`,
              });
              currentComment = await destination.readArchiveComment!({page: destinationPage, commentId: currentComment.id});
              if (verifies(currentComment)) {
                return currentComment;
              }
            }
          }
        };
        const presentations = fallbackReason ? [] : ['native', 'quote', 'code'] as const;
        let lastError: unknown;
        if (fallbackReason) {
          result = await write(expectedBody);
        } else {
          for (const presentation of presentations) {
            try {
              expectedBody = render(presentation, replacement);
              result = await write(expectedBody);
              if (presentation !== 'native') fallbackReason = `Destination rejected the native collapsible archive; ${presentation} fallback was used.`;
              lastError = undefined;
              break;
            } catch (error) {
              lastError = error;
              const status = (error as {status?: unknown}).status;
              if (status === 413 || /(?:status[=: ]+413|too large|payload too large)/i.test(error instanceof Error ? error.message : String(error))) {
                try {
                  await prepareFullArchive('Destination rejected the inline archive size; the full archive was attached as Markdown.');
                  result = await write(expectedBody);
                  lastError = undefined;
                  break;
                } catch (fallbackError) {
                  lastError = fallbackError;
                }
              }
              const reconciled = await destination.findArchiveComment?.(destinationPage, fingerprint);
              if (reconciled) {
                result = reconciled;
                expectedBody = reconciled.body;
                fallbackReason = presentation === 'native' ? undefined : `Destination accepted the ${presentation} fallback after an ambiguous response.`;
                lastError = undefined;
                break;
              }
            }
          }
          if (lastError) throw lastError;
        }
      }
      if (!result) throw new Error('Destination comment archive was not created');
      if (requiresWrite && current && destination.capabilities.updateComments && result.id === current.id) {
        report.issue({
          code: 'destination-revision-updated',
          severity: 'normalization',
          phase: 'comment',
          pageId: page.canonicalId,
          commentId: result.id,
          retryable: false,
          message: `${page.title}: applied the current source discussion as comment version ${result.version ?? 'confirmed'}`,
        });
      }
      const verified = await destination.readArchiveComment({page: destinationPage, commentId: result.id});
      const verification = verifyCommentArchive(fullArchiveState.fullArchiveName ? fingerprint : inventory, verified.body, archiveResource?.name);
      if (fullArchiveState.fullArchiveName && !verified.body.includes(fullArchiveState.fullArchiveName)) {
        verification.ok = false;
        verification.differences.push('full Markdown comment archive reference is missing');
      }
      const semanticVerification = verifyDestinationContent(expectedBody, verified.body, destination.kind, page);
      if (semanticVerification.status !== 'complete') {
        verification.ok = false;
        verification.differences.push(...semanticVerification.differences);
      }
      if (!verification.ok) throw new Error(`Comment verification failed: ${verification.differences.join('; ')}`);
      if (fallbackReason) {
        report.issue({
          code: 'comment-presentation-adapted',
          severity: 'adaptation',
          phase: 'comment',
          pageId: page.canonicalId,
          commentId: verified.id,
          retryable: false,
          message: `${page.title}: ${fallbackReason}`,
        });
      }
      const previousIds = result.id !== current?.id && current
        ? [...new Set([...(previous?.previousDestinationIds ?? []), current.id])]
        : previous?.previousDestinationIds;
      const state: CommentTransferState = {
        fingerprint,
        destinationId: verified.id,
        destinationFingerprint: verified.fingerprint,
        ...(verified.version ? {destinationVersion: verified.version} : {}),
        ...(verified.url ? {destinationUrl: verified.url} : {}),
        ...(previousIds?.length ? {previousDestinationIds: previousIds} : {}),
        ...archiveState,
        ...fullArchiveState,
        status: inventory.warnings.length > 0 ? 'partial' : 'complete',
        ...counts,
        preview: verified.body,
        updatedAt: now(),
      };
      pageState.comments = state;
      await store.setPage({...pageState, comments: state, updatedAt: now()});
      return state;
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason ?? error;
      const message = error instanceof Error ? error.message : String(error);
      return {
        fingerprint,
        ...counts,
        ...(pageState.comments?.destinationId ? {destinationId: pageState.comments.destinationId} : {}),
        ...(pageState.comments?.destinationFingerprint ? {destinationFingerprint: pageState.comments.destinationFingerprint} : {}),
        ...(pageState.comments?.destinationVersion ? {destinationVersion: pageState.comments.destinationVersion} : {}),
        status: 'failed',
        lastError: message,
        updatedAt: now(),
      };
    }
  }

  private async transferRemote(input: {
    source: SourceAdapter;
    destination: DestinationAdapter;
    container: DestinationContainer;
    graph: PageGraph;
    options: TransferOptions;
    store: StateStore;
    report: TransferReport;
    sourceFingerprints: Map<string, string>;
    resourcesByPage: Map<string, SourceResource[]>;
    commentsByPage: Map<string, CommentInventory>;
  }): Promise<void> {
    const {source, destination, container, graph, options, store, report, sourceFingerprints, resourcesByPage, commentsByPage} = input;
    const destinationPages = new Map<string, DestinationPage>();
    const mappedOwners = new Map<string, string[]>();
    for (const page of Object.values(store.value.pages)) {
      const destinationId = page.destinationId;
      if (!destinationId) continue;
      mappedOwners.set(destinationId, [...(mappedOwners.get(destinationId) ?? []), page.sourceCanonicalId]);
    }
    const ownershipConflicts = new Map(
      [...mappedOwners.entries()]
        .filter(([, owners]) => owners.length > 1)
        .flatMap(([destinationId, owners]) => owners.map((owner) => [owner, {destinationId, owners}] as const)),
    );
    const stagingFailures = new Map<string, {
      status: PageTransferStatus;
      message: string;
      blockedByPageId: string;
      blockedByCode: string;
    }>();
    const sourcePages = new Map(graph.pages.map((page) => [page.canonicalId, page]));
    const bootstrapBodies = new Map<string, RenderedDocument>();
    const totalResources = [...resourcesByPage.values()].reduce(
      (total, resources) => total + resources.filter((resource) => resource.kind !== 'grid').length,
      0,
    );
    const totalCommentArchives = (options.comments ?? true) ? graph.pages.length : 0;
    const progress = {staged: 0, pages: 0, resources: 0, comments: 0};
    const totalUnits = Math.max(1, graph.pages.length * 2 + totalResources + totalCommentArchives);
    const updateProgress = (active: string): void => {
      const completed = progress.staged + progress.pages + progress.resources + progress.comments;
      options.onStatus?.(`Progress ${Math.min(100, Math.floor((completed / totalUnits) * 100))}% · pages ${progress.pages}/${graph.pages.length} · files ${progress.resources}/${totalResources} · comments ${progress.comments}/${totalCommentArchives} · ${active}`);
    };

    for (const page of graph.pages) {
      const [document, cachedPage] = await Promise.all([
        loadCachedDocument(options.cacheDirectory, page.canonicalId),
        loadCachedPage(options.cacheDirectory, page.canonicalId),
      ]);
      const resources = resourcesByPage.get(page.canonicalId) ?? [];
      bootstrapBodies.set(page.canonicalId, await renderRemoteDocument({
        destination,
        container,
        document,
        page: cachedPage,
        context: {
          pages: new Map(),
          resources: sourceResourceBindings(cachedPage, resources),
          sourcePages,
          currentPageId: page.canonicalId,
        },
      }));
    }

    for (const page of graph.pages) {
      if (options.signal?.aborted) throw options.signal.reason ?? new Error('Transfer cancelled');
      const saved = store.value.pages[page.canonicalId];
      const parent = page.projectedParentId ? destinationPages.get(page.projectedParentId) : container;
      if (!parent) {
        const upstream = page.projectedParentId ? stagingFailures.get(page.projectedParentId) : undefined;
        const blockedByPageId = upstream?.blockedByPageId ?? page.projectedParentId ?? page.canonicalId;
        const blockedByCode = upstream?.blockedByCode ?? 'destination-parent-unavailable';
        const message = `Destination parent is unavailable for ${page.title}; blocked by ${blockedByPageId} (${blockedByCode})`;
        const cause = {blockedByPageId, blockedByCode, blockedReason: message};
        stagingFailures.set(page.canonicalId, {status: 'blocked', message, blockedByPageId, blockedByCode});
        const previous = store.value.pages[page.canonicalId];
        const resources = resourcesByPage.get(page.canonicalId) ?? [];
        const comments = (options.comments ?? true)
          ? blockedCommentState(commentsByPage.get(page.canonicalId), previous?.comments, cause)
          : undefined;
        await store.setPage({
          sourceId: page.id,
          sourceCanonicalId: page.canonicalId,
          sourceLocator: page.locator,
          sourceTitle: page.title,
          ...(page.projectedParentId ? {projectedParentId: page.projectedParentId} : {}),
          destinationTitle: previous?.destinationTitle ?? page.title,
          ...(previous?.destinationId ? {destinationId: previous.destinationId} : {}),
          ...(previous?.destinationCanonicalId ? {destinationCanonicalId: previous.destinationCanonicalId} : {}),
          ...(previous?.destinationLocator ? {destinationLocator: previous.destinationLocator} : {}),
          ...(previous?.previousDestinationIds ? {previousDestinationIds: previous.previousDestinationIds} : {}),
          sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
          ...(previous?.destinationFingerprint ? {destinationFingerprint: previous.destinationFingerprint} : {}),
          ...(previous?.destinationVersion ? {destinationVersion: previous.destinationVersion} : {}),
          status: 'blocked',
          resources: blockedResourceStates(resources, previous?.resources ?? {}, cause),
          ...(comments ? {comments} : {}),
          degradations: previous?.degradations ?? [],
          ...cause,
          lastError: message,
          updatedAt: new Date().toISOString(),
        });
        report.updatePage(page.canonicalId, {status: 'blocked', error: message, ...cause});
        report.issue({
          code: 'destination-parent-unavailable',
          severity: 'blocked',
          phase: 'page',
          pageId: page.canonicalId,
          retryable: false,
          blockedByPageId,
          blockedByCode,
          message,
        });
        progress.staged += 1;
        updateProgress(message);
        continue;
      }
      try {
        const ownershipConflict = ownershipConflicts.get(page.canonicalId);
        if (ownershipConflict) {
          throw new DestinationOwnershipConflictError(
            'duplicate-source-mapping',
            [ownershipConflict.destinationId, ...ownershipConflict.owners],
            `Multiple source pages are mapped to destination page ${ownershipConflict.destinationId}: ${ownershipConflict.owners.join(', ')}`,
          );
        }
        const cachedPage = await loadCachedPage(options.cacheDirectory, page.canonicalId);
        const bootstrap = bootstrapBodies.get(page.canonicalId)!;
        let created: DestinationPage;
        const title = saved && saved.destinationTitle !== saved.sourceTitle
          ? saved.destinationTitle
          : page.title;
        let resourcesForState = saved?.resources ?? {};
        let commentsForState = saved?.comments;
        let previousDestinationIds = saved?.previousDestinationIds ?? [];
        let mappingRecovered = false;
        const allocatePage = (preferredTitle?: string) => createPageWithAllocatedTitle({
          destination,
          parent,
          sourcePage: cachedPage,
          bootstrap,
          ...(preferredTitle ? {preferredTitle} : {}),
          consistencyOptions: this.consistencyOptions,
          report,
        });
        if (saved?.destinationId) {
          const mapped = destinationFromState(saved, destination);
          try {
            created = await verifyConfirmedDestinationPage(destination, mapped, {
              ...this.consistencyOptions,
              onRetry: (attempt, delayMs) => report.issue({
                code: 'destination-consistency-retry',
                severity: 'warning',
                phase: 'verification',
                pageId: page.canonicalId,
                retryable: true,
                message: `${page.title}: destination page ${mapped.id} returned 404; consistency retry ${attempt} in ${delayMs} ms`,
              }),
            });
          } catch (error) {
            if (!(error instanceof ConfirmedDestinationMissingError) || options.dryRun) throw error;
            if (page.projectedParentId) {
              await verifyConfirmedDestinationPage(destination, parent as DestinationPage, this.consistencyOptions);
            }
            const allocation = await allocatePage(title);
            created = allocation.page;
            previousDestinationIds = [...new Set([...previousDestinationIds, mapped.id])];
            resourcesForState = resetResourceDestinations(saved.resources);
            commentsForState = undefined;
            mappingRecovered = true;
            report.issue({
              code: 'destination-mapping-recovered',
              severity: 'warning',
              phase: 'page',
              pageId: page.canonicalId,
              retryable: false,
              message: `${page.title}: replaced unavailable destination mapping ${mapped.id} with ${created.id}`,
            });
          }
          if (
            !mappingRecovered
            && saved.destinationFingerprint
            && created.fingerprint
            && created.fingerprint !== saved.destinationFingerprint
          ) {
            report.issue({
              code: 'destination-revision-updated',
              severity: 'normalization',
              phase: 'page',
              pageId: page.canonicalId,
              retryable: false,
              message: `${page.title}: current destination revision differs from the last confirmed state and will be reconciled from source`,
            });
          }
          if (!mappingRecovered && created.parentId !== parent.id) {
            const oldPage = created;
            if (options.dryRun) {
              report.addHierarchyRepair({
                sourceCanonicalId: page.canonicalId,
                mode: destination.capabilities.reparentPages && destination.reparentPage ? 'moved' : 'recreated',
                ...(created.parentId ? {oldParentId: created.parentId} : {}),
                newParentId: parent.id,
                oldDestinationId: created.id,
                newDestinationId: created.id,
                verified: false,
              });
            } else if (destination.capabilities.reparentPages && destination.reparentPage) {
              created = await reparentMappedPage({
                destination,
                current: created,
                parent,
                sourcePage: cachedPage,
                consistencyOptions: this.consistencyOptions,
                report,
              });
              if (created.parentId !== parent.id) {
                throw new Error(`Destination hierarchy verification failed for ${page.title}: expected parent ${parent.id}, received ${created.parentId ?? 'none'}`);
              }
              report.addHierarchyRepair({
                sourceCanonicalId: page.canonicalId,
                mode: 'moved',
                ...(oldPage.parentId ? {oldParentId: oldPage.parentId} : {}),
                newParentId: parent.id,
                oldDestinationId: oldPage.id,
                newDestinationId: created.id,
                verified: true,
              });
              report.issue({
                code: 'destination-hierarchy-repaired',
                severity: 'normalization',
                phase: 'page',
                pageId: page.canonicalId,
                retryable: false,
                message: `${page.title}: moved destination page ${created.id} from parent ${oldPage.parentId ?? 'none'} to ${parent.id} and verified the hierarchy`,
              });
            } else {
              created = (await allocatePage(title)).page;
              previousDestinationIds = [...new Set([...previousDestinationIds, oldPage.id])];
              resourcesForState = resetResourceDestinations(saved.resources);
              commentsForState = undefined;
              mappingRecovered = true;
              report.addHierarchyRepair({
                sourceCanonicalId: page.canonicalId,
                mode: 'recreated',
                ...(oldPage.parentId ? {oldParentId: oldPage.parentId} : {}),
                newParentId: parent.id,
                oldDestinationId: oldPage.id,
                newDestinationId: created.id,
                verified: true,
              });
              report.issue({
                code: 'destination-hierarchy-recreated',
                severity: 'normalization',
                phase: 'page',
                pageId: page.canonicalId,
                retryable: false,
                message: `${page.title}: created verified replacement ${created.id} below ${parent.id}; previous page ${oldPage.id} was left untouched`,
              });
            }
          }
        } else if (options.dryRun) {
          created = {
            provider: destination.kind,
            profile: destination.profile.name,
            id: `dry-run:${page.id}`,
            canonicalId: `dry-run:${page.canonicalId}`,
            title,
            url: container.url,
            locator: `dry-run:${page.id}`,
            parentId: parent.id,
            content: bootstrap.body,
            contentLength: Buffer.byteLength(bootstrap.body),
            ...(container.space ? {space: container.space} : {}),
          };
        } else {
          const allocation = await allocatePage(title);
          created = allocation.page;
          if (allocation.reused) {
            mappingRecovered = true;
            report.issue({
              code: 'destination-unmapped-page-recovered',
              severity: 'normalization',
              phase: 'page',
              pageId: page.canonicalId,
              retryable: false,
              message: `${page.title}: adopted an existing source-derived page below the expected parent`,
            });
          }
        }
        if (!options.dryRun && created.parentId !== parent.id) {
          throw new Error(`Destination hierarchy verification failed for ${page.title}: expected parent ${parent.id}, received ${created.parentId ?? 'none'}`);
        }
        destinationPages.set(page.canonicalId, created);
        const next: PageTransferState = {
          sourceId: page.id,
          sourceCanonicalId: page.canonicalId,
          sourceLocator: page.locator,
          sourceTitle: page.title,
          ...(page.projectedParentId ? {projectedParentId: page.projectedParentId} : {}),
          destinationId: created.id,
          destinationCanonicalId: created.canonicalId,
          destinationLocator: created.url,
          destinationTitle: saved?.destinationId && !mappingRecovered ? title : created.title,
          ...(previousDestinationIds.length > 0 ? {previousDestinationIds} : {}),
          sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
          ...(created.fingerprint ? {destinationFingerprint: created.fingerprint} : {}),
          ...(created.version ? {destinationVersion: created.version} : {}),
          status: options.dryRun ? 'planned' : 'skeleton-created',
          resources: resourcesForState,
          ...(commentsForState ? {comments: commentsForState} : {}),
          degradations: saved?.degradations ?? [],
          updatedAt: new Date().toISOString(),
        };
        await store.setPage(next);
        options.onStatus?.(`${options.dryRun ? 'Planned' : 'Staged content for'} ${page.title}`);
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason ?? error;
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        const ownershipConflict = error instanceof DestinationOwnershipConflictError ? error : undefined;
        const failureStatus: PageTransferStatus = ownershipConflict ? 'conflict' : 'failed';
        const failureCode = ownershipConflict ? 'destination-ownership-ambiguity' : 'destination-page-staging-failed';
        stagingFailures.set(page.canonicalId, {
          status: failureStatus,
          message,
          blockedByPageId: page.canonicalId,
          blockedByCode: failureCode,
        });
        report.updatePage(page.canonicalId, {status: failureStatus, error: message});
        report.issue({
          code: failureCode,
          severity: 'error',
          phase: 'page',
          pageId: page.canonicalId,
          retryable: failureStatus !== 'conflict',
          message,
        });
        const savedState = store.value.pages[page.canonicalId];
        if (!options.dryRun) {
          const {conflictEvidence: _staleConflictEvidence, ...baseState} = savedState ?? {};
          const cause = {blockedByPageId: page.canonicalId, blockedByCode: failureCode, blockedReason: message};
          const resources = resourcesByPage.get(page.canonicalId) ?? [];
          const comments = (options.comments ?? true)
            ? blockedCommentState(commentsByPage.get(page.canonicalId), savedState?.comments, cause)
            : undefined;
          await store.setPage({
            ...baseState,
            sourceId: page.id,
            sourceCanonicalId: page.canonicalId,
            sourceLocator: page.locator,
            sourceTitle: page.title,
            ...(page.projectedParentId ? {projectedParentId: page.projectedParentId} : {}),
            destinationTitle: savedState?.destinationTitle ?? page.title,
            sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
            status: failureStatus,
            resources: blockedResourceStates(resources, savedState?.resources ?? {}, cause),
            ...(comments ? {comments} : {}),
            degradations: savedState?.degradations ?? [],
            adaptations: savedState?.adaptations ?? [],
            ...(ownershipConflict ? {conflictEvidence: {reason: ownershipConflict.reason, candidateIds: ownershipConflict.candidateIds}} : {}),
            lastError: message,
            updatedAt: new Date().toISOString(),
          });
        }
      } finally {
        progress.staged += 1;
        updateProgress(`content staged ${page.title}`);
      }
    }

    const contentQueue = new PQueue({concurrency: options.concurrency});
    const contentTasks = graph.pages.map((page) => contentQueue.add(async () => {
      if (options.signal?.aborted) throw options.signal.reason ?? new Error('Transfer cancelled');
      const destinationPage = destinationPages.get(page.canonicalId);
      const document = await loadCachedDocument(options.cacheDirectory, page.canonicalId);
      const cachedPage = await loadCachedPage(options.cacheDirectory, page.canonicalId);
      const resources = resourcesByPage.get(page.canonicalId) ?? [];
      if (!destinationPage) {
        const currentFailure = stagingFailures.get(page.canonicalId);
        const failedState = store.value.pages[page.canonicalId];
        const blockedBy = {
          blockedByPageId: currentFailure?.blockedByPageId ?? page.canonicalId,
          blockedByCode: currentFailure?.blockedByCode ?? 'destination-page-unavailable',
          blockedReason: currentFailure?.message ?? failedState?.lastError ?? 'Destination page with source-derived content was not created',
        };
        const commentState = failedState?.comments ?? ((options.comments ?? true)
          ? blockedCommentState(commentsByPage.get(page.canonicalId), undefined, blockedBy)
          : undefined);
        report.addPage(reportPage({
          page,
          status: currentFailure?.status ?? 'blocked',
          resources,
          document,
          ...(failedState?.resources ? {resourceStates: failedState.resources} : {}),
          resourceStatusOverride: options.dryRun ? 'planned' : 'blocked',
          commentsEnabled: options.comments ?? true,
          ...(commentsByPage.get(page.canonicalId) ? {commentInventory: commentsByPage.get(page.canonicalId)} : {}),
          ...(commentState ? {commentState} : {}),
          ...(failedState?.conflictEvidence ? {conflictEvidence: failedState.conflictEvidence} : {}),
          blockedBy,
          error: currentFailure?.message ?? failedState?.lastError ?? 'Destination page with source-derived content was not created',
        }));
        progress.pages += 1;
        updateProgress(`blocked ${page.title}`);
        return;
      }
      const state = store.value.pages[page.canonicalId]!;
      const bootstrap = bootstrapBodies.get(page.canonicalId)!;
      const bindings = sourceResourceBindings(cachedPage, resources);
      const transferableResources = resources.filter((item) => item.kind !== 'grid');
      const resourceProblems: string[] = [];
      const failedResourceIds = new Set<string>();
      const recordResourceFailure = async (resource: SourceResource, detail: string): Promise<void> => {
        if (!failedResourceIds.has(resource.id)) {
          failedResourceIds.add(resource.id);
          resourceProblems.push(detail);
          report.issue({
            code: 'resource-transfer-failed',
            severity: 'error',
            phase: 'resource',
            pageId: page.canonicalId,
            resourceId: resource.id,
            retryable: true,
            message: `${page.title}: ${detail}`,
          });
        }
        const previous = state.resources[resource.id];
        state.resources[resource.id] = {
          sourceId: resource.id,
          sourceName: resource.name,
          ...(previous?.destinationId ? {destinationId: previous.destinationId} : {}),
          destinationName: previous?.destinationName ?? preferredDestinationName(resource),
          ...(previous?.sha256 ? {sha256: previous.sha256} : {}),
          ...(previous?.size !== undefined ? {size: previous.size} : resource.size !== undefined ? {size: resource.size} : {}),
          ...(previous?.cachePath ? {cachePath: previous.cachePath} : {}),
          ...(previous?.mimeType ? {mimeType: previous.mimeType} : {}),
          status: 'failed',
          lastError: detail,
          updatedAt: new Date().toISOString(),
        };
        await store.setPage({...state, status: 'partial', lastError: detail, updatedAt: new Date().toISOString()});
      };
      try {
        let remoteResources = options.dryRun || transferableResources.length === 0
          ? []
          : await destination.listUploadedResources(destinationPage);
        const nameAllocator = new DestinationNameAllocator(remoteResources.map((resource) => resource.name));
        for (const resourceState of Object.values(state.resources)) {
          if (resourceState.status === 'complete') nameAllocator.reserve(resourceState.destinationName);
        }
        const fallbackBinding = (resource: SourceResource) => [...sourceResourceBindings(cachedPage, [resource]).values()][0]!;
        const remoteMatches = async (
          remote: (typeof remoteResources)[number],
          downloaded: {path: string; size: number; sha256: string},
          trustedMapping = false,
        ): Promise<boolean> => {
          if (remote.size !== undefined && remote.size !== downloaded.size) return false;
          if (!destination.downloadUploadedResource) {
            return remote.fingerprint === downloaded.sha256
              || (trustedMapping && (remote.size === undefined || remote.size === downloaded.size));
          }
          const comparisonPath = `${downloaded.path}.destination-${sha256(remote.id).slice(0, 8)}`;
          try {
            const actual = await destination.downloadUploadedResource({page: destinationPage, resource: remote, destination: comparisonPath});
            return actual.size === downloaded.size && actual.sha256 === downloaded.sha256;
          } finally {
            await rm(comparisonPath, {force: true});
          }
        };
        for (const resource of transferableResources) {
          const existing = state.resources[resource.id];
          if (options.dryRun) {
            const destinationName = nameAllocator.allocate(resource, existing?.status === 'complete' ? existing.destinationName : undefined);
            setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: {
              id: `dry-run:${resource.id}`,
              name: destinationName,
              ...(resource.size !== undefined ? {size: resource.size} : {}),
            }});
            progress.resources += 1;
            updateProgress(`planned ${resource.name}`);
            continue;
          }
          try {
            const filename = containedCachePath(options.cacheDirectory, existing?.cachePath)
              ?? cachePath(options.cacheDirectory, page, resource);
            const cached = await verifiedCacheFile(filename, existing?.sha256 ? {
              sha256: existing.sha256,
              ...(existing.size !== undefined ? {size: existing.size} : {}),
              ...(existing.mimeType ? {mimeType: existing.mimeType} : {}),
            } : undefined);
            const downloaded = cached ?? await source.downloadResource(resource, filename);
            const mimeType = downloaded.mimeType ?? existing?.mimeType ?? resource.mimeType;
            const mappedRemote = existing?.destinationId
              ? remoteResources.find((item) => item.id === existing.destinationId)
              : undefined;
            if (mappedRemote && await remoteMatches(mappedRemote, downloaded, true)) {
              setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: mappedRemote});
              state.resources[resource.id] = {
                sourceId: resource.id,
                sourceName: resource.name,
                destinationId: mappedRemote.id,
                destinationName: mappedRemote.name,
                ...(mappedRemote.url ? {destinationUrl: mappedRemote.url} : {}),
                sha256: downloaded.sha256,
                size: downloaded.size,
                cachePath: downloaded.path,
                ...(mimeType ? {mimeType} : {}),
                status: 'complete',
                updatedAt: new Date().toISOString(),
              };
              await store.setPage({...state, updatedAt: new Date().toISOString()});
              updateProgress(`reused ${resource.name}`);
              continue;
            }
            const reconciliationNames = new Set([
              preferredDestinationName(resource),
              ...(existing?.sha256 ? [existing.destinationName] : []),
            ].map((name) => name.toLocaleLowerCase()));
            const reconciled = remoteResources.find((item) => reconciliationNames.has(item.name.toLocaleLowerCase()));
            if (reconciled && await remoteMatches(reconciled, downloaded)) {
              setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: reconciled});
              state.resources[resource.id] = {
                sourceId: resource.id,
                sourceName: resource.name,
                destinationId: reconciled.id,
                destinationName: reconciled.name,
                ...(reconciled.url ? {destinationUrl: reconciled.url} : {}),
                sha256: downloaded.sha256,
                size: downloaded.size,
                cachePath: downloaded.path,
                ...(mimeType ? {mimeType} : {}),
                status: 'complete',
                updatedAt: new Date().toISOString(),
              };
              await store.setPage({...state, updatedAt: new Date().toISOString()});
              updateProgress(`reconciled ${resource.name}`);
              continue;
            }
            const updateExisting = destination.kind === 'confluence' && existing?.status === 'complete' && mappedRemote ? mappedRemote : undefined;
            let destinationName = updateExisting?.name ?? nameAllocator.allocate(
              resource,
              existing?.status === 'complete' && !nameAllocator.isOccupied(existing.destinationName) ? existing.destinationName : undefined,
            );
            state.resources[resource.id] = {
              sourceId: resource.id,
              sourceName: resource.name,
              destinationName,
              sha256: downloaded.sha256,
              size: downloaded.size,
              cachePath: downloaded.path,
              ...(mimeType ? {mimeType} : {}),
              status: 'planned',
              updatedAt: new Date().toISOString(),
            };
            await store.setPage({...state, updatedAt: new Date().toISOString()});
            let result: (typeof remoteResources)[number] | undefined;
            let lastUploadError: unknown;
            for (let attempt = 0; attempt < 10 && !result; attempt += 1) {
              const matchingName = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
              if (matchingName && await remoteMatches(matchingName, downloaded)) {
                result = matchingName;
                break;
              }
              if (matchingName) {
                nameAllocator.reserve(matchingName.name);
                destinationName = nameAllocator.allocate(resource);
                continue;
              }
              try {
                result = await destination.uploadResource({
                  page: destinationPage,
                  name: destinationName,
                  filePath: downloaded.path,
                  size: downloaded.size,
                  ...(mimeType ? {mimeType} : {}),
                  ...(attempt === 0 && updateExisting ? {existingId: updateExisting.id} : {}),
                });
              } catch (uploadError) {
                lastUploadError = uploadError;
                remoteResources = await destination.listUploadedResources(destinationPage);
                for (const remote of remoteResources) nameAllocator.reserve(remote.name);
                const uncertain = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
                if (uncertain && await remoteMatches(uncertain, downloaded)) {
                  result = uncertain;
                  break;
                }
                destinationName = nameAllocator.allocate(resource);
              }
            }
            if (!result) {
              throw new Error(`Resource upload could not be reconciled after 10 deterministic names: ${lastUploadError instanceof Error ? lastUploadError.message : String(lastUploadError ?? 'unknown provider response')}`);
            }
            if (!remoteResources.some((item) => item.id === result.id)) remoteResources.push(result);
            setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: result});
            state.resources[resource.id] = {
              sourceId: resource.id,
              sourceName: resource.name,
              destinationId: result.id,
              destinationName: result.name,
              ...(result.url ? {destinationUrl: result.url} : {}),
              sha256: downloaded.sha256,
              size: downloaded.size,
              cachePath: downloaded.path,
              ...(mimeType ? {mimeType} : {}),
              status: 'complete',
              updatedAt: new Date().toISOString(),
            };
            await store.setPage({...state, updatedAt: new Date().toISOString()});
            updateProgress(`uploaded ${resource.name} → ${page.title}`);
          } catch (error) {
            await recordResourceFailure(resource, `Resource ${resource.name} was not transferred: ${error instanceof Error ? error.message : String(error)}`);
            updateProgress(`fallback ${resource.name} → ${page.title}`);
          } finally {
            progress.resources += 1;
          }
        }

        if (!options.dryRun && transferableResources.length > 0) {
          try {
            remoteResources = await destination.listUploadedResources(destinationPage);
            for (const resource of transferableResources) {
              const transferred = state.resources[resource.id];
              if (transferred?.status !== 'complete') continue;
              const remote = remoteResources.find((item) => item.id === transferred.destinationId || item.name === transferred.destinationName);
              const sizeMismatch = transferred.size !== undefined
                && remote?.size !== undefined
                && transferred.size !== remote.size;
              if (!remote || sizeMismatch) {
                setSourceResourceBinding(bindings, cachedPage, resources, resource, fallbackBinding(resource));
                await recordResourceFailure(
                  resource,
                  !remote
                    ? `Verification did not find destination resource for ${resource.name}`
                    : `Verification size mismatch for ${resource.name}: ${transferred.size} source bytes, ${remote.size} destination bytes`,
                );
              } else {
                setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: remote});
              }
            }
          } catch (error) {
            for (const resource of transferableResources) {
              if (state.resources[resource.id]?.status !== 'complete') continue;
              setSourceResourceBinding(bindings, cachedPage, resources, resource, fallbackBinding(resource));
              await recordResourceFailure(resource, `Destination resource verification failed for ${resource.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }

        const context: RenderContext = {
          pages: destinationPages,
          resources: bindings,
          sourcePages,
          currentPageId: page.canonicalId,
        };
        const rendered = await renderRemoteDocument({destination, container, document, page: cachedPage, context});
        if (rendered.degraded && !options.dryRun) {
          if (transferableResources.length === 0) {
            remoteResources = await destination.listUploadedResources(destinationPage);
          }
          const extension = page.rawFormat === 'yfm' ? 'yfm' : 'storage.xml';
          const snapshotName = `ywtc-source-${sha256(page.canonicalId).slice(0, 8)}.${extension}`;
          const snapshotPath = path.join(options.cacheDirectory, 'snapshots', snapshotName);
          await mkdir(path.dirname(snapshotPath), {recursive: true});
          await writeFile(snapshotPath, cachedPage.rawContent, {mode: 0o600});
          const snapshotKey = `snapshot:${page.canonicalId}`;
          const existingSnapshot = state.resources[snapshotKey];
          const snapshotFile = {
            path: snapshotPath,
            size: Buffer.byteLength(cachedPage.rawContent),
            sha256: sha256(cachedPage.rawContent),
          };
          try {
            const mappedSnapshot = remoteResources.find((item) => item.id === existingSnapshot?.destinationId);
            let snapshot = mappedSnapshot && await remoteMatches(mappedSnapshot, snapshotFile, true)
              ? mappedSnapshot
              : undefined;
            const sameNameSnapshot = remoteResources.find((item) => item.name.toLocaleLowerCase() === snapshotName.toLocaleLowerCase());
            if (!snapshot && sameNameSnapshot && await remoteMatches(sameNameSnapshot, snapshotFile, false)) {
              snapshot = sameNameSnapshot;
            }
            const snapshotResource: SourceResource = {
              provider: cachedPage.provider,
              id: snapshotKey,
              pageId: cachedPage.id,
              name: snapshotName,
              preferredName: snapshotName,
              kind: 'attachment',
            };
            let destinationName = mappedSnapshot && destination.kind === 'confluence'
              ? mappedSnapshot.name
              : nameAllocator.allocate(snapshotResource);
            let lastUploadError: unknown;
            for (let attempt = 0; attempt < 10 && !snapshot; attempt += 1) {
              const occupied = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
              if (occupied && await remoteMatches(occupied, snapshotFile, occupied.id === mappedSnapshot?.id)) {
                snapshot = occupied;
                break;
              }
              if (occupied && occupied.id !== mappedSnapshot?.id) {
                nameAllocator.reserve(occupied.name);
                destinationName = nameAllocator.allocate(snapshotResource);
                continue;
              }
              try {
                snapshot = await destination.uploadResource({
                  page: destinationPage,
                  name: destinationName,
                  filePath: snapshotPath,
                  size: snapshotFile.size,
                  mimeType: page.rawFormat === 'yfm' ? 'text/markdown' : 'application/xml',
                  ...(attempt === 0 && mappedSnapshot && destination.kind === 'confluence' ? {existingId: mappedSnapshot.id} : {}),
                });
              } catch (uploadError) {
                lastUploadError = uploadError;
                remoteResources = await destination.listUploadedResources(destinationPage);
                for (const remote of remoteResources) nameAllocator.reserve(remote.name);
                const uncertain = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
                if (uncertain && await remoteMatches(uncertain, snapshotFile, uncertain.id === mappedSnapshot?.id)) {
                  snapshot = uncertain;
                  break;
                }
                destinationName = nameAllocator.allocate(snapshotResource);
              }
            }
            if (!snapshot) {
              throw new Error(`Raw snapshot upload could not be reconciled after 10 deterministic names: ${lastUploadError instanceof Error ? lastUploadError.message : String(lastUploadError ?? 'unknown provider response')}`);
            }
            if (!remoteResources.some((item) => item.id === snapshot.id)) remoteResources.push(snapshot);
            state.resources[snapshotKey] = {
              sourceId: snapshotKey,
              sourceName: snapshotName,
              destinationId: snapshot.id,
              destinationName: snapshot.name,
              ...(snapshot.size !== undefined ? {size: snapshot.size} : {}),
              sha256: snapshotFile.sha256,
              cachePath: snapshotPath,
              mimeType: page.rawFormat === 'yfm' ? 'text/markdown' : 'application/xml',
              status: 'complete',
              updatedAt: new Date().toISOString(),
            };
          } catch (error) {
            const detail = `Raw source snapshot was not transferred: ${error instanceof Error ? error.message : String(error)}`;
            resourceProblems.push(detail);
            report.issue({
              code: 'source-snapshot-transfer-failed',
              severity: 'error',
              phase: 'resource',
              pageId: page.canonicalId,
              resourceId: snapshotKey,
              retryable: true,
              message: `${page.title}: ${detail}`,
            });
            state.resources[snapshotKey] = {
              sourceId: snapshotKey,
              sourceName: snapshotName,
              destinationName: snapshotName,
              status: 'failed',
              lastError: detail,
              updatedAt: new Date().toISOString(),
            };
          }
          state.degradations = [...new Set([...rendered.warnings, ...resourceProblems])];
        }
        let verified = destinationPage;
        let verificationAdaptations: string[] = [];
        let verificationDegradations: string[] = [];
        if (!options.dryRun) {
          const current = await verifyConfirmedDestinationPage(destination, destinationPage, this.consistencyOptions);
          const update = await updateMappedPage({
            destination,
            current,
            title: state.destinationTitle,
            body: rendered.body,
            sourcePage: cachedPage,
            consistencyOptions: this.consistencyOptions,
            report,
          });
          verified = update.page;
          if (update.normalized) rendered.normalizations.push('Destination normalized page markup without semantic content changes');
          if (update.updated) {
            report.issue({
              code: 'destination-revision-updated',
              severity: 'normalization',
              phase: 'page',
              pageId: page.canonicalId,
              retryable: false,
              message: `${page.title}: applied the current source representation as destination version ${verified.version ?? 'confirmed'}`,
            });
          }
          const verification = assertDestinationContent(rendered.body, verified.content, destination.kind, cachedPage);
          verificationAdaptations = verification.adaptations;
          verificationDegradations = verification.status === 'partial' ? verification.differences : [];
        }
        const commentInventory = commentsByPage.get(page.canonicalId);
        const commentState = (options.comments ?? true)
          ? await this.transferRemoteComments({
            source,
            destination,
            page: cachedPage,
            destinationPage: verified,
            inventory: commentInventory,
            resources,
            pageState: state,
            cacheDirectory: options.cacheDirectory,
            dryRun: options.dryRun,
            destinationPages,
            sourcePages,
            report,
            store,
            ...(options.signal ? {signal: options.signal} : {}),
          })
          : {
            status: 'skipped' as const,
            threads: 0,
            comments: 0,
            participants: 0,
            attachments: 0,
            bytes: 0,
            updatedAt: new Date().toISOString(),
          };
        if (options.comments ?? true) {
          progress.comments += 1;
          updateProgress(`comments ${commentState.status} → ${page.title}`);
        }
        if (
          ['failed', 'conflict', 'stale', 'partial'].includes(commentState.status)
          && !(commentState.status === 'failed' && commentInventory?.status === 'failed')
          && !(commentState.status === 'partial' && (commentInventory?.warnings.length ?? 0) > 0 && !commentState.lastError)
        ) {
          report.issue({
            code: `comment-${commentState.status}`,
            severity: commentState.status === 'partial' || commentState.status === 'stale' ? 'degradation' : 'error',
            phase: 'comment',
            pageId: page.canonicalId,
            retryable: commentState.status === 'failed',
            message: `${page.title}: ${commentState.lastError ?? `comment archive is ${commentState.status}`}`,
          });
        }
        const commentPartial = !['complete', 'skipped', 'planned'].includes(commentState.status);
        const renderedDegradations = rendered.notices
          .filter((notice) => notice.kind === 'degradation')
          .map((notice) => notice.message);
        const partial = renderedDegradations.length > 0 || resourceProblems.length > 0 || verificationDegradations.length > 0 || commentPartial;
        const lastResourceProblem = resourceProblems.at(-1);
        const clearedState = {...state};
        delete clearedState.lastError;
        const finalState: PageTransferState = {
          ...clearedState,
          destinationId: verified.id,
          destinationCanonicalId: verified.canonicalId,
          destinationLocator: verified.url,
          destinationTitle: verified.title,
          ...(verified.fingerprint ? {destinationFingerprint: verified.fingerprint} : {}),
          ...(verified.version ? {destinationVersion: verified.version} : {}),
          status: options.dryRun ? 'planned' : partial ? 'partial' : 'complete',
          comments: commentState,
          degradations: [...new Set([...renderedDegradations, ...resourceProblems, ...verificationDegradations])],
          adaptations: [...new Set([...rendered.adaptations, ...verificationAdaptations])],
          ...(lastResourceProblem ? {lastError: lastResourceProblem} : {}),
          updatedAt: new Date().toISOString(),
        };
        await store.setPage(finalState);
        const fallbackDetails = resources.flatMap((resource) => {
          const resourceState = finalState.resources[resource.id];
          return resourceState?.status === 'failed'
            ? [{name: resource.name, error: resourceState.lastError ?? 'Resource was not transferred'}]
            : [];
        });
        report.addPage(reportPage({
          page,
          destination: verified,
          status: finalState.status,
          resources,
          document,
          resourceStates: finalState.resources,
          ...(options.dryRun ? {resourceStatusOverride: 'planned'} : {}),
          resourceFallbacks: fallbackDetails,
          warnings: [...rendered.warnings, ...verificationDegradations],
          normalizations: rendered.normalizations,
          adaptations: [...rendered.adaptations, ...verificationAdaptations],
          preservedExternalReferences: rendered.preservedExternalReferences,
          commentsEnabled: options.comments ?? true,
          ...(commentInventory ? {commentInventory} : {}),
          commentState,
        }), {source: normalizedPreviewHtml(document), destination: renderedPreviewHtml(verified.content ?? rendered.body, destination.kind)});
      } catch (error) {
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        const ownershipConflict = error instanceof DestinationOwnershipConflictError ? error : undefined;
        let failureStatus: PageTransferState['status'] = ownershipConflict ? 'conflict' : 'failed';
        let actual: DestinationPage | undefined;
        if (failureStatus !== 'conflict' && !options.dryRun) {
          try {
            actual = await verifyConfirmedDestinationPage(destination, destinationPage, this.consistencyOptions);
            assertDestinationContent(bootstrap.body, actual.content, destination.kind, cachedPage);
            failureStatus = 'partial';
          } catch {
            failureStatus = 'failed';
          }
        }
        report.issue({
          code: ownershipConflict ? 'destination-ownership-ambiguity' : 'page-transfer-failed',
          severity: 'error',
          phase: 'page',
          pageId: page.canonicalId,
          retryable: failureStatus !== 'conflict',
          message,
        });
        await store.setPage({
          ...state,
          ...(actual?.fingerprint ? {destinationFingerprint: actual.fingerprint} : {}),
          ...(actual?.version ? {destinationVersion: actual.version} : {}),
          status: failureStatus,
          ...(ownershipConflict ? {conflictEvidence: {reason: ownershipConflict.reason, candidateIds: ownershipConflict.candidateIds}} : {}),
          lastError: message,
          updatedAt: new Date().toISOString(),
        });
        const fallbackDetails = resources.flatMap((resource) => {
          const resourceState = state.resources[resource.id];
          return resourceState?.status === 'failed'
            ? [{name: resource.name, error: resourceState.lastError ?? 'Resource was not transferred'}]
            : [];
        });
        report.addPage(
          reportPage({
            page,
            destination: actual ?? destinationPage,
            status: failureStatus,
            resources,
            document,
            resourceStates: state.resources,
            ...(options.dryRun ? {resourceStatusOverride: 'planned'} : {}),
            resourceFallbacks: fallbackDetails,
            error: message,
            commentsEnabled: options.comments ?? true,
            ...(commentsByPage.get(page.canonicalId) ? {commentInventory: commentsByPage.get(page.canonicalId)} : {}),
            ...(state.comments ? {commentState: state.comments} : {}),
            ...(ownershipConflict ? {conflictEvidence: {reason: ownershipConflict.reason, candidateIds: ownershipConflict.candidateIds}} : {}),
          }),
          actual?.content ? {source: normalizedPreviewHtml(document), destination: renderedPreviewHtml(actual.content, destination.kind)} : undefined,
        );
      } finally {
        progress.pages += 1;
        updateProgress(`${options.dryRun ? 'planned' : 'completed'} ${page.title}`);
      }
    }, options.signal ? {signal: options.signal} : undefined));
    const settled = await Promise.allSettled(contentTasks);
    await contentQueue.onIdle();
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected) throw rejected.reason;
  }
}
