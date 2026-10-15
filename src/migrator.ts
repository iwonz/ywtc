import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
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
  sourceResourceBindings,
} from './content-model.js';
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
import {safeFilename} from './input.js';
import type {Logger} from './logger.js';
import type {DirectoryLocator, RemoteLocator, ResolvedLocator} from './locators.js';
import {profileBaseUrl, sameRemoteInstance} from './locators.js';
import {TransferReport, type MigrationReportPaths, type TransferReportPage} from './report.js';
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
  return path.join(cacheDirectory, pageKey, `${resourceKey}-${safeFilename(resource.name)}`);
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
  error?: string;
}): TransferReportPage {
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
    resources: input.resources.filter((resource) => resource.kind !== 'grid').length,
    bytes: input.resources.reduce((total, resource) => total + (resource.size ?? 0), 0),
    links: input.document.metrics.links,
    images: input.document.metrics.images,
    tables: input.document.metrics.tables,
    codeBlocks: input.document.metrics.codeBlocks,
    degraded: input.document.degraded || (input.resourceFallbacks?.length ?? 0) > 0,
    resourceFallbacks: input.resourceFallbacks ?? [],
    warnings: [...input.document.warnings, ...(input.warnings ?? [])],
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
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {pages: 0, warnings: 0, errors: 1});
      throw new MigrationRunError(message, reportPaths, stateLocation.filename, {cause: error});
    }

    const resourcesByPage = new Map<string, SourceResource[]>();
    const inventoryQueue = new PQueue({concurrency: options.concurrency});
    const inventory = {resources: 0, bytes: 0, grids: 0, links: 0, images: 0, tables: 0, codeBlocks: 0};
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
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {pages: graph.pages.length, warnings: graph.warnings.length, errors: inventoryErrors.length});
      throw new MigrationRunError('Resource preflight failed before destination mutation', reportPaths, stateLocation.filename);
    }
    const planSummary = `Plan ready: ${graph.pages.length} pages · ${inventory.resources} files (${inventory.bytes} bytes) · ${inventory.links} links · ${inventory.images} images · ${inventory.tables} tables (${inventory.grids} grids) · ${inventory.codeBlocks} code blocks`;
    status(planSummary);
    this.logger.info(planSummary);

    let output: string | undefined;
    let archive: string | undefined;
    let transferErrors = 0;
    let transferWarnings = graph.warnings.length;
    try {
      if (options.destination.type === 'directory') {
        const result = await this.exportFilesystem(source, graph, options.destination, options, stateLocation.id, store, report, sourceFingerprints, resourcesByPage);
        output = result.directory;
        archive = result.archive;
        transferErrors += result.errors.length;
        transferWarnings += result.warnings.length;
        report.output('directory', result.directory);
        if (result.archive) report.output('archive', result.archive);
        if (result.backup) report.output('backup', result.backup);
      } else {
        const result = await this.transferRemote({
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
        transferErrors += result.errors;
        transferWarnings += result.warnings;
        output = container!.url;
        report.output('destination', container!.url);
      }
      const finalStatus = runStatus(transferErrors, transferWarnings);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {pages: graph.pages.length, warnings: transferWarnings, errors: transferErrors});
      status(`${finalStatus}: ${graph.pages.length} pages · ${transferErrors} errors · ${transferWarnings} warnings`);
      return {
        status: finalStatus,
        hasErrors: transferErrors > 0,
        reportPaths,
        stateId: stateLocation.id,
        stateFilename: stateLocation.filename,
        ...(store.loadInfo.backupFilename ? {stateBackupFilename: store.loadInfo.backupFilename} : {}),
        ...(output ? {output} : {}),
        ...(archive ? {archive} : {}),
        summary: {...report.data.summary, warnings: transferWarnings, errors: transferErrors},
      };
    } catch (error) {
      const cancelled = options.signal?.aborted;
      const finalStatus: RunStatus = cancelled ? 'cancelled' : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      report.error(message);
      report.finish(finalStatus);
      const reportPaths = await report.write(options.reportsDirectory);
      if (!options.dryRun) await store.finishRun(run.id, finalStatus, {pages: graph.pages.length, warnings: transferWarnings, errors: transferErrors + 1});
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
      const resources = Object.fromEntries((manifestPage?.resources ?? []).map((resource, index) => [String(index), {
        sourceId: String(index),
        sourceName: resource.name,
        destinationId: resource.path,
        destinationName: resource.name,
        ...(resource.sha256 ? {sha256: resource.sha256} : {}),
        ...(resource.size !== undefined ? {size: resource.size} : {}),
        status: 'complete' as const,
        updatedAt: new Date().toISOString(),
      }]));
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
        resources: resourcesByPage.get(page.canonicalId) ?? [],
        document,
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
  }): Promise<{errors: number; warnings: number}> {
    const {source, destination, container, graph, options, store, report, sourceFingerprints, resourcesByPage} = input;
    const destinationPages = new Map<string, DestinationPage>();
    const sourcePages = new Map(graph.pages.map((page) => [page.canonicalId, page]));
    const bootstrapBodies = new Map<string, RenderedDocument>();
    let errors = 0;
    let warnings = 0;
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
        errors += 1;
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
        if (saved?.destinationId) {
          created = await destination.verifyPage(destinationFromState(saved, destination));
          const generatedPlaceholder = created.title === saved.destinationTitle
            && isLegacyTransferPlaceholder(created.content, destination.kind, cachedPage);
          if (['complete', 'partial'].includes(saved.status) && saved.destinationFingerprint && created.fingerprint !== saved.destinationFingerprint && !generatedPlaceholder) {
            throw new Error(`Destination conflict for ${page.title}: content changed since the last verified run`);
          }
          if (generatedPlaceholder && !options.dryRun) {
            created = await destination.updatePage({
              page: created,
              title: created.title,
              body: bootstrap.body,
              ...(created.fingerprint ? {expectedFingerprint: created.fingerprint} : {}),
            });
            created = await destination.verifyPage(created);
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
          created = await destination.verifyPage(created);
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
          sourceFingerprint: sourceFingerprints.get(page.canonicalId)!,
          ...(created.fingerprint ? {destinationFingerprint: created.fingerprint} : {}),
          status: options.dryRun ? 'planned' : saved?.status ?? 'skeleton-created',
          resources: saved?.resources ?? {},
          degradations: saved?.degradations ?? [],
          updatedAt: new Date().toISOString(),
        };
        await store.setPage(next);
        options.onStatus?.(`${options.dryRun ? 'Planned' : 'Staged content for'} ${page.title}`);
      } catch (error) {
        errors += 1;
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
      const resourceProblems: string[] = [];
      const failedResourceIds = new Set<string>();
      const recordResourceFailure = async (resource: SourceResource, detail: string): Promise<void> => {
        if (!failedResourceIds.has(resource.id)) {
          failedResourceIds.add(resource.id);
          errors += 1;
          resourceProblems.push(detail);
          report.error(`${page.title}: ${detail}`);
        }
        const previous = state.resources[resource.id];
        state.resources[resource.id] = {
          sourceId: resource.id,
          sourceName: resource.name,
          ...(previous?.destinationId ? {destinationId: previous.destinationId} : {}),
          destinationName: previous?.destinationName ?? safeFilename(resource.name),
          ...(previous?.sha256 ? {sha256: previous.sha256} : {}),
          ...(previous?.size !== undefined ? {size: previous.size} : resource.size !== undefined ? {size: resource.size} : {}),
          status: 'failed',
          lastError: detail,
          updatedAt: new Date().toISOString(),
        };
        await store.setPage({...state, status: 'partial', lastError: detail, updatedAt: new Date().toISOString()});
      };
      try {
        for (const resource of resources.filter((item) => item.kind !== 'grid')) {
          const key = resource.name.toLocaleLowerCase();
          const existing = state.resources[resource.id];
          if (existing?.status === 'complete' && existing.destinationId) {
            bindings.set(key, {kind: 'uploaded', resource: {
              id: existing.destinationId,
              name: existing.destinationName,
              ...(existing.size !== undefined ? {size: existing.size} : {}),
              ...(existing.sha256 ? {fingerprint: existing.sha256} : {}),
            }});
            progress.resources += 1;
            updateProgress(`reused ${resource.name}`);
            continue;
          }
          if (options.dryRun) {
            bindings.set(key, {kind: 'uploaded', resource: {
              id: `dry-run:${resource.id}`,
              name: safeFilename(resource.name),
              ...(resource.size !== undefined ? {size: resource.size} : {}),
            }});
            progress.resources += 1;
            updateProgress(`planned ${resource.name}`);
            continue;
          }
          try {
            const filename = cachePath(options.cacheDirectory, page, resource);
            const downloaded = await source.downloadResource(resource, filename);
            const result = await destination.uploadResource({
              page: destinationPage,
              name: safeFilename(resource.name),
              filePath: downloaded.path,
              size: downloaded.size,
              ...(downloaded.mimeType ?? resource.mimeType ? {mimeType: downloaded.mimeType ?? resource.mimeType} : {}),
              ...(existing?.destinationId ? {existingId: existing.destinationId} : {}),
            });
            bindings.set(key, {kind: 'uploaded', resource: result});
            state.resources[resource.id] = {
              sourceId: resource.id,
              sourceName: resource.name,
              destinationId: result.id,
              destinationName: result.name,
              sha256: downloaded.sha256,
              size: downloaded.size,
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

        if (!options.dryRun && resources.some((resource) => resource.kind !== 'grid')) {
          try {
            const remoteResources = await destination.listUploadedResources(destinationPage);
            for (const resource of resources.filter((item) => item.kind !== 'grid')) {
              const transferred = state.resources[resource.id];
              if (transferred?.status !== 'complete') continue;
              const remote = remoteResources.find((item) => item.id === transferred.destinationId || item.name === transferred.destinationName);
              const sizeMismatch = destination.kind === 'confluence'
                && transferred.size !== undefined
                && remote?.size !== undefined
                && transferred.size !== remote.size;
              if (!remote || sizeMismatch) {
                bindings.set(resource.name.toLocaleLowerCase(), sourceResourceBindings(cachedPage, [resource]).get(resource.name.toLocaleLowerCase())!);
                await recordResourceFailure(
                  resource,
                  !remote
                    ? `Verification did not find destination resource for ${resource.name}`
                    : `Verification size mismatch for ${resource.name}: ${transferred.size} source bytes, ${remote.size} destination bytes`,
                );
              } else {
                bindings.set(resource.name.toLocaleLowerCase(), {kind: 'uploaded', resource: remote});
              }
            }
          } catch (error) {
            for (const resource of resources.filter((item) => item.kind !== 'grid')) {
              if (state.resources[resource.id]?.status !== 'complete') continue;
              bindings.set(resource.name.toLocaleLowerCase(), sourceResourceBindings(cachedPage, [resource]).get(resource.name.toLocaleLowerCase())!);
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
        warnings += rendered.warnings.length;
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
            errors += 1;
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
          state.degradations = [...new Set([...state.degradations, ...rendered.warnings, ...resourceProblems])];
        }
        let verified = destinationPage;
        if (!options.dryRun) {
          const current = await destination.verifyPage(destinationPage);
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
          verified = await destination.verifyPage(verified);
          assertDestinationContent(rendered.body, verified.content, destination.kind, cachedPage);
        }
        const partial = rendered.degraded || resourceProblems.length > 0;
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
          degradations: [...new Set([...state.degradations, ...rendered.warnings, ...resourceProblems])],
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
          resourceFallbacks: fallbackDetails,
          warnings: [...rendered.warnings, ...resourceProblems],
        }), {source: normalizedPreviewHtml(document), destination: renderedPreviewHtml(verified.content ?? rendered.body, destination.kind)});
      } catch (error) {
        errors += 1;
        const message = `${page.title}: ${error instanceof Error ? error.message : String(error)}`;
        let failureStatus: PageTransferState['status'] = /conflict/i.test(message) ? 'conflict' : 'failed';
        let actual: DestinationPage | undefined;
        if (failureStatus !== 'conflict' && !options.dryRun) {
          try {
            actual = await destination.verifyPage(destinationPage);
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
    return {errors, warnings};
  }
}
