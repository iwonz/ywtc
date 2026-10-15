import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import {createProviderAdapter} from './adapters/factory.js';
import type {AppConfig} from './config.js';
import {
  appendGridSnapshots,
  assertDestinationContent,
  isLegacyTransferPlaceholder,
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
import {ConfirmedDestinationMissingError, type ConsistencyRetryOptions, verifyConfirmedDestinationPage} from './consistency.js';
import type {
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
  TransferScope,
} from './domain.js';
import {assertTransferCapabilities} from './domain.js';
import {FilesystemExporter, type FilesystemExportResult} from './filesystem-export.js';
import {discoverPageGraph} from './graph.js';
import type {Logger} from './logger.js';
import type {DirectoryLocator, RemoteLocator, ResolvedLocator} from './locators.js';
import {profileBaseUrl, sameRemoteInstance} from './locators.js';
import {TransferReport, type MigrationReportPaths, type TransferReportPage} from './report.js';
import {DestinationNameAllocator, preferredDestinationName, verifiedCacheFile} from './resource-reconciliation.js';
import {
  resolveStateLocation,
  StateStore,
  type EndpointIdentity,
  type PageTransferState,
  type RunStatus,
  type TransferIdentity,
} from './state.js';

export interface TransferOptions {
  source: RemoteLocator;
  destination: ResolvedLocator;
  scope: TransferScope;
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
  summary: {
    pages: number;
    complete: number;
    partial: number;
    failed: number;
    resources: number;
    bytes: number;
    links: number;
    cycles: number;
    warnings: number;
    errors: number;
  };
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
  return sha256(`${page.title}\0${page.rawContent}\0${page.version ?? ''}`);
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

function collisionTitle(page: SourcePage): string {
  const suffix = page.locator.split('/').filter(Boolean).at(-1) ?? page.id;
  return `${page.title} [${suffix}]`;
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
  const result = verifyDestinationContent(expectedBody, actualBody, provider, page);
  if (result.status === 'complete') return true;
  const text = (value: string): string => renderedPreviewHtml(value, provider).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text(expectedBody) === text(actualBody);
}

function destinationFromState(state: PageTransferState, adapter: DestinationAdapter): DestinationPage {
  if (!state.destinationId || !state.destinationCanonicalId || !state.destinationLocator) {
    throw new Error(`Incomplete mapped destination for ${state.sourceTitle}`);
  }
  return {
    provider: adapter.kind,
    profile: adapter.profile.name,
    id: state.destinationId,
    canonicalId: state.destinationCanonicalId,
    title: state.destinationTitle,
    url: state.destinationLocator,
    locator: state.destinationId,
    ...(state.destinationFingerprint ? {fingerprint: state.destinationFingerprint} : {}),
  };
}

function reportPage(input: {
  page: SourcePage & {depth: number; projectedParentId?: string};
  destination?: DestinationPage;
  status: string;
  resources: SourceResource[];
  document: NormalizedDocument;
  resourceFallbacks?: Array<{name: string; error: string}>;
  warnings?: string[];
  normalizations?: string[];
  resourceSizes?: Record<string, {size?: number}>;
  error?: string;
}): TransferReportPage {
  const transferable = input.resources.filter((resource) => resource.kind !== 'grid');
  const sizes = transferable.map((resource) => input.resourceSizes?.[resource.id]?.size ?? resource.size);
  const knownBytes = sizes.reduce<number>((total, size) => total + (size ?? 0), 0);
  return {
    sourceCanonicalId: input.page.canonicalId,
    sourceId: input.page.id,
    sourceTitle: input.page.title,
    sourceUrl: input.page.url,
    ...(input.destination ? {
      destinationId: input.destination.id,
      destinationTitle: input.destination.title,
      destinationUrl: input.destination.url,
    } : {}),
    ...(input.page.projectedParentId ? {parentId: input.page.projectedParentId} : {}),
    depth: input.page.depth,
    status: input.status,
    resources: transferable.length,
    ...(transferable.length === 0 || sizes.some((size) => size !== undefined) ? {bytes: knownBytes} : {}),
    bytesUnknown: sizes.filter((size) => size === undefined).length,
    links: input.document.metrics.links,
    images: input.document.metrics.images,
    tables: input.document.metrics.tables,
    codeBlocks: input.document.metrics.codeBlocks,
    degraded: input.document.degraded || (input.resourceFallbacks?.length ?? 0) > 0,
    resourceFallbacks: input.resourceFallbacks ?? [],
    warnings: [...new Set([...input.document.warnings, ...(input.warnings ?? [])])],
    normalizations: [...new Set([...(input.document.normalizations ?? []), ...(input.normalizations ?? [])])],
    ...(input.error ? {error: input.error} : {}),
  };
}

function runStatus(errors: number, warnings: number): RunStatus {
  if (errors > 0) return 'partial';
  return warnings > 0 ? 'completed-with-warnings' : 'completed';
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
    if (!rendered.body.trim()) return rawContentFallback(input.page, input.destination.kind, 'renderer returned an empty body');
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
    const source = this.adapterFactory(options.source.profile, this.config);
    const destination = options.destination.type === 'remote'
      ? this.adapterFactory(options.destination.profile, this.config)
      : undefined;
    assertTransferCapabilities(source, destination, options.scope);
    const status = options.onStatus ?? (() => undefined);
    status('Checking source and destination capabilities');
    const [sourcePlatform, destinationPlatform, root, container] = await Promise.all([
      source.preflight(),
      destination?.preflight(),
      source.resolvePage(options.source.value),
      options.destination.type === 'remote' && destination ? destination.resolveContainer(options.destination.value) : undefined,
    ]);
    status(`Connected to ${sourcePlatform.product}${destinationPlatform ? ` and ${destinationPlatform.product}` : ''}`);

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
    if (!options.dryRun) await store.save();
    const run = await store.beginRun(options.scope, options.dryRun);
    const report = new TransferReport({
      dryRun: options.dryRun,
      scope: options.scope,
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

    let graph: PageGraph;
    let sourceFingerprints: Map<string, string>;
    try {
      status(`Discovering ${options.scope} scope from ${root.title}`);
      graph = await discoverPageGraph({
        adapter: source,
        root,
        scope: options.scope,
        ...(options.signal ? {signal: options.signal} : {}),
        onProgress: (progress) => status(`Discovery: ${progress.pages} pages, ${progress.edges} links${progress.active ? ` · ${progress.active}` : ''}`),
      });
      if (
        container
        && options.destination.type === 'remote'
        && sameRemoteInstance(options.source.profile, options.destination.profile)
        && graph.pages.some((page) => page.id === container.id)
      ) {
        throw new Error('The destination page belongs to the selected source graph. Choose a destination outside the transferred graph.');
      }
      status(`Caching source content for ${graph.pages.length} pages`);
      sourceFingerprints = await cacheDiscoveredPages(options.cacheDirectory, graph);
      await store.setGraph(graph.rootId, graph.edges);
      report.setEdges(graph.edges);
      for (const warning of graph.warnings) report.warning(warning);
    } catch (error) {
      const finalStatus: RunStatus = options.signal?.aborted ? 'cancelled' : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      report.error(message);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {
        pages: 0,
        warnings: report.data.summary.warnings,
        errors: report.data.summary.errors,
      });
      throw new MigrationRunError(message, reportPaths, stateLocation.filename, {cause: error});
    }

    const resourcesByPage = new Map<string, SourceResource[]>();
    const inventoryQueue = new PQueue({concurrency: options.concurrency});
    const inventory = {resources: 0, bytes: 0, unknownSizes: 0, grids: 0, links: 0, images: 0, tables: 0, codeBlocks: 0};
    status(`Inspecting content and resources for ${graph.pages.length} pages`);
    const inventoryErrors: string[] = [];
    await Promise.all(graph.pages.map((page) => inventoryQueue.add(async () => {
      try {
        if (options.signal?.aborted) throw options.signal.reason ?? new Error('Transfer cancelled');
        const cachedPage = await loadCachedPage(options.cacheDirectory, page.canonicalId);
        const resources = await source.listResources(page);
        resourcesByPage.set(page.canonicalId, resources);
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
        status(`Inspected ${page.title} · ${resources.length} resources`);
      } catch (error) {
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        inventoryErrors.push(message);
        report.error(message);
      }
    })));
    if (inventoryErrors.length > 0) {
      const finalStatus: RunStatus = options.signal?.aborted ? 'cancelled' : 'failed';
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {
        pages: graph.pages.length,
        warnings: report.data.summary.warnings,
        errors: report.data.summary.errors,
      });
      throw new MigrationRunError('Resource preflight failed before destination mutation', reportPaths, stateLocation.filename);
    }
    const planSummary = `Plan ready: ${graph.pages.length} pages · ${inventory.resources} files (${inventory.bytes} known bytes${inventory.unknownSizes > 0 ? ` · ${inventory.unknownSizes} sizes unknown` : ''}) · ${inventory.links} links · ${inventory.images} images · ${inventory.tables} tables (${inventory.grids} grids) · ${inventory.codeBlocks} code blocks`;
    status(planSummary);
    this.logger.info(planSummary);

    let output: string | undefined;
    let archive: string | undefined;
    try {
      if (options.destination.type === 'directory') {
        const result = await this.exportFilesystem(source, graph, options.destination, options, stateLocation.id, store, report, sourceFingerprints, resourcesByPage);
        output = result.directory;
        archive = result.archive;
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
        });
        output = container!.url;
        report.output('destination', container!.url);
      }
      report.finish('completed');
      const finalStatus = runStatus(report.data.summary.errors, report.data.summary.warnings);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {
        pages: graph.pages.length,
        warnings: report.data.summary.warnings,
        errors: report.data.summary.errors,
      });
      status(`${finalStatus}: ${graph.pages.length} pages · ${report.data.summary.errors} errors · ${report.data.summary.warnings} warnings`);
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
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {
        pages: graph.pages.length,
        warnings: report.data.summary.warnings,
        errors: report.data.summary.errors,
      });
      this.logger.error(`${message}. Report: ${reportPaths.html}`);
      throw new MigrationRunError(message, reportPaths, stateLocation.filename, {cause: error});
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
        ...(resource.sha256 ? {sha256: resource.sha256} : {}),
        ...(resource.size !== undefined ? {size: resource.size} : {}),
        status: 'complete' as const,
        updatedAt: new Date().toISOString(),
      }];
      }));
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
        status: options.dryRun ? 'planned' : manifestPage?.degraded ? 'partial' : 'complete',
        resources,
        degradations: manifestPage?.warnings ?? [],
        updatedAt: new Date().toISOString(),
      });
      report.addPage(reportPage({
        page,
        status: options.dryRun ? 'planned' : result.errors.length ? 'partial' : 'complete',
        resources: sourceResources,
        document,
        resourceSizes: resources,
        ...(manifestPage?.warnings ? {warnings: manifestPage.warnings} : {}),
      }), {source: normalizedPreviewHtml(document), destination: normalizedPreviewHtml(document)});
    }
    for (const warning of result.warnings) report.warning(warning);
    for (const error of result.errors) report.error(error);
    return result;
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
  }): Promise<void> {
    const {source, destination, container, graph, options, store, report, sourceFingerprints, resourcesByPage} = input;
    const destinationPages = new Map<string, DestinationPage>();
    const sourcePages = new Map(graph.pages.map((page) => [page.canonicalId, page]));
    const bootstrapBodies = new Map<string, RenderedDocument>();
    const totalResources = [...resourcesByPage.values()].reduce(
      (total, resources) => total + resources.filter((resource) => resource.kind !== 'grid').length,
      0,
    );
    const progress = {staged: 0, pages: 0, resources: 0};
    const totalUnits = Math.max(1, graph.pages.length * 2 + totalResources);
    const updateProgress = (active: string): void => {
      const completed = progress.staged + progress.pages + progress.resources;
      options.onStatus?.(`Progress ${Math.min(100, Math.floor((completed / totalUnits) * 100))}% · pages ${progress.pages}/${graph.pages.length} · files ${progress.resources}/${totalResources} · ${active}`);
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
        const message = `Destination parent is unavailable for ${page.title}`;
        report.error(message);
        progress.staged += 1;
        updateProgress(message);
        continue;
      }
      try {
        const cachedPage = await loadCachedPage(options.cacheDirectory, page.canonicalId);
        const bootstrap = bootstrapBodies.get(page.canonicalId)!;
        let created: DestinationPage;
        let title = saved?.destinationTitle ?? page.title;
        let resourcesForState = saved?.resources ?? {};
        let previousDestinationIds = saved?.previousDestinationIds ?? [];
        let mappingRecovered = false;
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
            const candidate = await (destination.findRecoverablePage?.(parent, title) ?? destination.findChild(parent, title));
            if (candidate && sourceDerivedTextMatches(bootstrap.body, candidate.content, destination.kind, cachedPage)) {
              created = candidate;
            } else {
              let recoveryTitle = title;
              const occupied = candidate ?? await destination.findChild(parent, recoveryTitle);
              if (occupied) {
                const base = collisionTitle(page);
                const hash = sha256(page.canonicalId).slice(0, 8);
                recoveryTitle = base;
                let sequence = 0;
                while (await destination.findChild(parent, recoveryTitle)) {
                  sequence += 1;
                  recoveryTitle = `${base} [${hash}${sequence > 1 ? `-${sequence}` : ''}]`;
                }
              }
              created = await destination.createPage({container: parent, title: recoveryTitle, body: bootstrap.body});
              created = await verifyConfirmedDestinationPage(destination, created, this.consistencyOptions);
              assertDestinationContent(bootstrap.body, created.content, destination.kind, cachedPage);
            }
            previousDestinationIds = [...new Set([...previousDestinationIds, mapped.id])];
            resourcesForState = resetResourceDestinations(saved.resources);
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
          const generatedPlaceholder = created.title === saved.destinationTitle
            && isLegacyTransferPlaceholder(created.content, destination.kind, cachedPage);
          if (!mappingRecovered && ['complete', 'partial'].includes(saved.status) && saved.destinationFingerprint && created.fingerprint !== saved.destinationFingerprint && !generatedPlaceholder) {
            throw new Error(`Destination conflict for ${page.title}: content changed since the last verified run`);
          }
          if (generatedPlaceholder && !options.dryRun) {
            created = await destination.updatePage({
              page: created,
              title: created.title,
              body: bootstrap.body,
              ...(created.fingerprint ? {expectedFingerprint: created.fingerprint} : {}),
            });
            created = await verifyConfirmedDestinationPage(destination, created, this.consistencyOptions);
            assertDestinationContent(bootstrap.body, created.content, destination.kind, cachedPage);
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
            content: bootstrap.body,
            contentLength: Buffer.byteLength(bootstrap.body),
            ...(container.space ? {space: container.space} : {}),
          };
        } else {
          if (await destination.findChild(parent, title)) {
            const base = collisionTitle(page);
            const hash = sha256(page.canonicalId).slice(0, 8);
            title = base;
            let sequence = 0;
            while (await destination.findChild(parent, title)) {
              sequence += 1;
              title = `${base} [${hash}${sequence > 1 ? `-${sequence}` : ''}]`;
            }
          }
          created = await destination.createPage({container: parent, title, body: bootstrap.body});
          created = await verifyConfirmedDestinationPage(destination, created, this.consistencyOptions);
          assertDestinationContent(bootstrap.body, created.content, destination.kind, cachedPage);
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
          destinationTitle: created.title,
          ...(previousDestinationIds.length > 0 ? {previousDestinationIds} : {}),
          sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
          ...(created.fingerprint ? {destinationFingerprint: created.fingerprint} : {}),
          status: options.dryRun ? 'planned' : saved?.status ?? 'skeleton-created',
          resources: resourcesForState,
          degradations: saved?.degradations ?? [],
          updatedAt: new Date().toISOString(),
        };
        await store.setPage(next);
        options.onStatus?.(`${options.dryRun ? 'Planned' : 'Staged content for'} ${page.title}`);
      } catch (error) {
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        report.error(message);
        const savedState = store.value.pages[page.canonicalId];
        if (savedState) await store.setPage({...savedState, status: /conflict/i.test(message) ? 'conflict' : 'failed', lastError: message, updatedAt: new Date().toISOString()});
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
        const failedState = store.value.pages[page.canonicalId];
        report.addPage(reportPage({
          page,
          status: failedState?.status ?? 'blocked',
          resources,
          document,
          error: failedState?.lastError ?? 'Destination page with source-derived content was not created',
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
        let remoteResources = options.dryRun ? [] : await destination.listUploadedResources(destinationPage);
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
            const updateExisting = existing?.status === 'complete' && mappedRemote ? mappedRemote : undefined;
            const destinationName = updateExisting?.name ?? nameAllocator.allocate(
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
            const matchingName = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
            let result = matchingName && await remoteMatches(matchingName, downloaded) ? matchingName : undefined;
            if (!result) {
              try {
                result = await destination.uploadResource({
                  page: destinationPage,
                  name: destinationName,
                  filePath: downloaded.path,
                  size: downloaded.size,
                  ...(mimeType ? {mimeType} : {}),
                  ...(updateExisting ? {existingId: updateExisting.id} : {}),
                });
              } catch (uploadError) {
                remoteResources = await destination.listUploadedResources(destinationPage);
                const uncertain = remoteResources.find((item) => item.name.toLocaleLowerCase() === destinationName.toLocaleLowerCase());
                if (uncertain && await remoteMatches(uncertain, downloaded)) result = uncertain;
                else {
                  const retryName = nameAllocator.allocate(resource);
                  result = await destination.uploadResource({
                    page: destinationPage,
                    name: retryName,
                    filePath: downloaded.path,
                    size: downloaded.size,
                    ...(mimeType ? {mimeType} : {}),
                  }).catch((retryError: unknown) => { throw new Error(`${retryError instanceof Error ? retryError.message : String(retryError)} (initial upload: ${uploadError instanceof Error ? uploadError.message : String(uploadError)})`); });
                }
              }
            }
            if (!remoteResources.some((item) => item.id === result.id)) remoteResources.push(result);
            setSourceResourceBinding(bindings, cachedPage, resources, resource, {kind: 'uploaded', resource: result});
            state.resources[resource.id] = {
              sourceId: resource.id,
              sourceName: resource.name,
              destinationId: result.id,
              destinationName: result.name,
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
          const extension = page.rawFormat === 'yfm' ? 'yfm' : 'storage.xml';
          const snapshotName = `ywtc-source-${sha256(page.canonicalId).slice(0, 8)}.${extension}`;
          const snapshotPath = path.join(options.cacheDirectory, 'snapshots', snapshotName);
          await mkdir(path.dirname(snapshotPath), {recursive: true});
          await writeFile(snapshotPath, cachedPage.rawContent, {mode: 0o600});
          const snapshotKey = `snapshot:${page.canonicalId}`;
          const existingSnapshot = state.resources[snapshotKey];
          try {
            const snapshot = existingSnapshot?.status === 'complete' && existingSnapshot.destinationId
              ? {
                id: existingSnapshot.destinationId,
                name: existingSnapshot.destinationName,
                ...(existingSnapshot.size !== undefined ? {size: existingSnapshot.size} : {}),
              }
              : await destination.uploadResource({
                page: destinationPage,
                name: snapshotName,
                filePath: snapshotPath,
                size: Buffer.byteLength(cachedPage.rawContent),
                mimeType: page.rawFormat === 'yfm' ? 'text/markdown' : 'application/xml',
                ...(existingSnapshot?.destinationId ? {existingId: existingSnapshot.destinationId} : {}),
              });
            state.resources[snapshotKey] = {
              sourceId: snapshotKey,
              sourceName: snapshotName,
              destinationId: snapshot.id,
              destinationName: snapshot.name,
              ...(snapshot.size !== undefined ? {size: snapshot.size} : {}),
              sha256: sha256(cachedPage.rawContent),
              status: 'complete',
              updatedAt: new Date().toISOString(),
            };
          } catch (error) {
            const detail = `Raw source snapshot was not transferred: ${error instanceof Error ? error.message : String(error)}`;
            resourceProblems.push(detail);
            report.error(`${page.title}: ${detail}`);
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
        let verificationDegradations: string[] = [];
        if (!options.dryRun) {
          const current = await verifyConfirmedDestinationPage(destination, destinationPage, this.consistencyOptions);
          if (
            destinationPage.contentFingerprint
            && current.contentFingerprint
            && current.contentFingerprint !== destinationPage.contentFingerprint
          ) {
            throw new Error(`Destination conflict for ${page.title}: content changed while resources were transferred`);
          }
          verified = await destination.updatePage({
            page: current,
            title: current.title,
            body: rendered.body,
            ...(current.fingerprint ? {expectedFingerprint: current.fingerprint} : {}),
          });
          if (verified.fingerprint) {
            state.destinationFingerprint = verified.fingerprint;
            await store.setPage({...state, updatedAt: new Date().toISOString()});
          }
          verified = await verifyConfirmedDestinationPage(destination, verified, this.consistencyOptions);
          const verification = assertDestinationContent(rendered.body, verified.content, destination.kind, cachedPage);
          verificationDegradations = verification.status === 'partial' ? verification.differences : [];
        }
        const partial = rendered.degraded || resourceProblems.length > 0 || verificationDegradations.length > 0;
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
          status: options.dryRun ? 'planned' : partial ? 'partial' : 'complete',
          degradations: [...new Set([...rendered.warnings, ...resourceProblems, ...verificationDegradations])],
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
          resourceSizes: finalState.resources,
          resourceFallbacks: fallbackDetails,
          warnings: [...rendered.warnings, ...verificationDegradations],
          normalizations: rendered.normalizations,
        }), {source: normalizedPreviewHtml(document), destination: renderedPreviewHtml(verified.content ?? rendered.body, destination.kind)});
      } catch (error) {
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        let failureStatus: PageTransferState['status'] = /conflict/i.test(message) ? 'conflict' : 'failed';
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
        report.error(message);
        await store.setPage({
          ...state,
          ...(actual?.fingerprint ? {destinationFingerprint: actual.fingerprint} : {}),
          status: failureStatus,
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
            resourceSizes: state.resources,
            resourceFallbacks: fallbackDetails,
            warnings: resourceProblems,
            error: message,
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
