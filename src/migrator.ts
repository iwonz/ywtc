import {createReadStream} from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import type {AppConfig} from './config.js';
import {
  convertGridToStorage,
  convertYfmToStorage,
  createAttachmentReferenceMap,
  emptyConversionStats,
  mergeConversionStats,
  renderYfmPreview,
  type ConversionContext,
  type ConversionResult,
  type DestinationPageReference,
} from './conversion.js';
import {safeFilename} from './input.js';
import type {Logger} from './logger.js';
import {redact} from './logger.js';
import {
  MigrationReport,
  renderStoragePreview,
  type ReportMigrationState,
  type MigrationReportPaths,
  type ReportAttachment,
  type ReportPage,
  type ReportPagePreviews,
  type ReportPageStatus,
  type ReportPreviewProvenance,
} from './report.js';
import {noopProgress, type MigrationProgress} from './progress.js';
import {resolveStateLocation, StateStore} from './state.js';
import {assignDestinationTitles} from './titles.js';
import {buildPageTree} from './tree.js';
import type {
  AttachmentPlan,
  AttachmentState,
  ConfluenceApi,
  MigrationPlanSummary,
  PagePlan,
  PageState,
  YandexAttachment,
  YandexGrid,
  YandexWikiApi,
} from './types.js';

export interface MigrationOptions {
  sourceSlug: string;
  target: string;
  dryRun: boolean;
  singlePage: boolean;
  fresh?: boolean;
  concurrency: number;
  stateFilename?: string;
  runtimeDirectory?: string;
}

export interface MigrationResult {
  hasErrors: boolean;
  reportPaths: MigrationReportPaths;
  stateId: string;
  stateFilename: string;
  stateBackupFilename?: string;
}

export interface MigratorDependencies {
  yandex: YandexWikiApi;
  confluence: ConfluenceApi;
  config: AppConfig;
  logger: Logger;
  progress?: MigrationProgress;
  secrets?: string[];
}

function errorMessage(error: unknown, secrets: string[]): string {
  return redact(error instanceof Error ? error.message : String(error), secrets);
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function placeholderBody(sourceUrl: string): string {
  return `<p><em>Migration in progress from <a href="${xml(sourceUrl)}">Yandex Wiki</a>.</em></p>`;
}

function sourceUrl(webUrl: string, slug: string): string {
  return new URL(slug.replace(/^\/+/, ''), `${webUrl}/`).toString();
}

function hasMeaningfulStorage(storage: string | undefined): boolean {
  if (!storage) return false;
  if (/<(?:ac:image|ac:structured-macro|table|img|ri:attachment)\b/i.test(storage)) return true;
  return storage
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|#160);/gi, '')
    .trim().length > 0;
}

function attachmentPlans(attachments: YandexAttachment[], existing?: PageState): AttachmentPlan[] {
  const used = new Set<string>();
  return attachments.map((source) => {
    const saved = existing?.attachments[String(source.id)]?.destinationName;
    let destinationName = saved ?? safeFilename(source.name);
    if (!saved && used.has(destinationName.toLocaleLowerCase())) {
      const extension = path.extname(destinationName);
      const basename = path.basename(destinationName, extension);
      destinationName = `${basename}__${source.id}${extension}`;
    }
    used.add(destinationName.toLocaleLowerCase());
    return {source, destinationName};
  });
}

function pageStateFromPlan(plan: PagePlan, destinationId: string, previous?: PageState): PageState {
  return {
    sourceId: plan.source.id,
    sourceSlug: plan.source.slug,
    sourceTitle: plan.source.title,
    ...(plan.parentSourceId !== undefined ? {parentSourceId: plan.parentSourceId} : {}),
    destinationId,
    destinationTitle: plan.destinationTitle,
    status: previous?.status ?? 'created',
    attachments: previous?.attachments ?? {},
    updatedAt: new Date().toISOString(),
  };
}

function attachmentSize(attachment: YandexAttachment): number {
  const size = Number(attachment.size);
  // Wiki reports this field as a decimal string in MiB (for example, "0.02").
  // It is rounded, so this is a preflight estimate; downloaded size is measured exactly.
  return Number.isFinite(size) && size > 0 ? Math.round(size * 1_024 * 1_024) : 0;
}

export class Migrator {
  private readonly secrets: string[];

  constructor(private readonly dependencies: MigratorDependencies) {
    this.secrets = dependencies.secrets ?? [];
  }

  async run(options: MigrationOptions): Promise<MigrationResult> {
    const {yandex, confluence, config, logger} = this.dependencies;
    const progress = this.dependencies.progress ?? noopProgress;
    const logInfo = this.dependencies.progress ? () => undefined : (message: string) => logger.info(message);
    progress.stage('Connecting', 'validating source and target access');
    logInfo(`Resolving source ${options.sourceSlug} and Confluence target`);
    const [root, target] = await Promise.all([
      yandex.getPageBySlug(options.sourceSlug),
      confluence.resolveTarget(options.target),
    ]);
    const spaceKey = target.space.key;
    if (!spaceKey) throw new Error('Confluence target response does not include a space key');
    if (target.operations?.length) {
      const reportsCreateChild = target.operations.some((operation) => (
        operation.operation === 'create'
        && ['page', 'content'].includes(operation.targetType)
      ));
      if (!reportsCreateChild) {
        logger.warn(
          `Confluence target ${target.id} does not advertise child-page creation in expanded content operations; `
          + 'continuing because this field does not reliably expose space-level Add Pages permission',
        );
      }
    }

    const stateLocation = resolveStateLocation({
      yandexApiUrl: config.yandex.apiUrl,
      yandexWebUrl: config.yandex.webUrl,
      yandexOrgId: config.yandex.orgId,
      yandexOrgType: config.yandex.orgType,
      sourcePageId: root.id,
      confluenceBaseUrl: config.confluence.baseUrl,
      targetPageId: target.id,
      spaceKey,
    }, {
      ...(options.stateFilename !== undefined ? {stateFilename: options.stateFilename} : {}),
      ...(options.runtimeDirectory !== undefined ? {runtimeDirectory: options.runtimeDirectory} : {}),
    });
    const stateStore = new StateStore(stateLocation.filename);
    const state = await stateStore.load({
      sourceRootSlug: root.slug,
      targetPageId: target.id,
      spaceKey,
    }, {
      fresh: options.fresh ?? false,
      dryRun: options.dryRun,
    });
    const stateLoad = stateStore.loadInfo;
    if (!options.dryRun) {
      // Persist or atomically rewrite the selected state before the first Confluence mutation.
      // This prevents a bad path or missing write permission from leaving an orphan destination page.
      await stateStore.save();
    }
    progress.state({
      id: stateLocation.id,
      mode: stateLocation.mode,
      filename: stateLocation.filename,
      source: stateLoad.source,
      dryRun: options.dryRun,
      ...(stateLoad.backupFilename ? {backupFilename: stateLoad.backupFilename} : {}),
    });
    if (stateLoad.source === 'fresh') {
      logger.warn(
        'Fresh state mode ignores prior mappings. Existing Confluence pages are not adopted and may be duplicated or receive suffixed titles.',
      );
    }
    const reportState: ReportMigrationState = {
      id: stateLocation.id,
      mode: stateLocation.mode,
      path: stateLocation.filename,
      source: stateLoad.source,
      ...(stateLoad.backupFilename ? {backupPath: stateLoad.backupFilename} : {}),
    };
    const report = new MigrationReport({
      dryRun: options.dryRun,
      sourceRoot: root.slug,
      sourceRootUrl: sourceUrl(config.yandex.webUrl, root.slug),
      targetPageId: target.id,
      targetUrl: confluence.pageWebUrl(target),
      spaceKey,
      state: reportState,
    });
    if (stateLoad.source === 'fresh') {
      report.addWarning('Fresh state ignored prior mappings; existing destination pages may be duplicated or receive suffixed titles.');
    }

    progress.stage(options.singlePage ? 'Selecting Wiki page' : 'Discovering Wiki tree', `root: ${root.title}`);
    logInfo(options.singlePage
      ? 'Single-page scope selected; skipping Wiki descendant discovery'
      : 'Discovering the accessible Wiki subtree');
    const identities = options.singlePage ? [] : await yandex.getDescendants(root.id);
    progress.stage('Reading page content', `${identities.length + 1} pages found`);
    const limit = pLimit(options.concurrency);
    const descendants = await Promise.all(identities.map((identity) => limit(() => yandex.getPageById(identity.id))));
    const tree = buildPageTree(root.id, [root, ...descendants.filter((page) => page.id !== root.id)]);
    tree.warnings.forEach((warning) => {
      report.addWarning(warning);
    });

    const currentSourceIds = new Set(tree.pages.map((page) => String(page.source.id)));
    report.data.staleDestinationPageIds = options.singlePage
      ? []
      : Object.entries(state.pages)
        .filter(([sourceId]) => !currentSourceIds.has(sourceId))
        .map(([, page]) => page.destinationId);

    for (const page of tree.pages) {
      const saved = state.pages[String(page.source.id)];
      if (saved) page.destinationTitle = saved.destinationTitle;
    }

    const titleLookup = new Map<string, Awaited<ReturnType<ConfluenceApi['findPageByTitle']>>>();
    const assigned = await assignDestinationTitles(tree.pages, async (title, page) => {
      const key = title.toLocaleLowerCase();
      if (!titleLookup.has(key)) titleLookup.set(key, await confluence.findPageByTitle(spaceKey, title));
      const existing = titleLookup.get(key);
      const mapped = state.pages[String(page.source.id)];
      return Boolean(existing && existing.id !== mapped?.destinationId);
    });
    report.data.renames.push(...assigned.renames);

    const pageReferences = new Map<string, DestinationPageReference>();
    for (const page of assigned.pages) {
      pageReferences.set(page.source.slug.replace(/^\/+|\/+$/g, '').toLocaleLowerCase(), {
        sourceId: page.source.id,
        slug: page.source.slug,
        destinationTitle: page.destinationTitle,
      });
    }

    const metadata = new Map<number, {attachments: YandexAttachment[]; grids: YandexGrid[]}>();
    const gridLimit = pLimit(options.concurrency);
    progress.stage('Inspecting resources', `${assigned.pages.length} pages`);
    logInfo(`Preflight discovered ${assigned.pages.length} page(s); inspecting resources`);
    await Promise.all(assigned.pages.map((page) => limit(async () => {
      try {
        const [attachments, gridSummaries] = await Promise.all([
          yandex.getAttachments(page.source.id),
          yandex.getPageGrids(page.source.id),
        ]);
        const grids = await Promise.all(gridSummaries.map((grid) => gridLimit(() => yandex.getGrid(grid.id))));
        metadata.set(page.source.id, {attachments, grids});
      } catch (error) {
        const message = `Resource preflight failed for ${page.source.slug}: ${errorMessage(error, this.secrets)}`;
        report.addError(message);
        metadata.set(page.source.id, {attachments: [], grids: []});
      }
    })));

    const previews = new Map<number, ConversionResult>();
    const aggregateStats = emptyConversionStats();
    let previewWarnings = 0;
    let attachments = 0;
    let attachmentBytes = 0;
    let dynamicTables = 0;
    let dynamicTableRows = 0;
    for (const page of assigned.pages) {
      const resources = metadata.get(page.source.id) ?? {attachments: [], grids: []};
      const plans = attachmentPlans(resources.attachments, state.pages[String(page.source.id)]);
      const context = this.conversionContext(page, spaceKey, pageReferences, plans.map((item) => ({
        sourceName: item.source.name,
        destinationName: item.destinationName,
        downloadUrl: item.source.download_url,
      })));
      const converted = this.convertPage(page, resources.grids, context);
      previews.set(page.source.id, converted);
      mergeConversionStats(aggregateStats, converted.stats);
      previewWarnings += converted.warnings.length;
      attachments += resources.attachments.length;
      attachmentBytes += resources.attachments.reduce((total, attachment) => total + attachmentSize(attachment), 0);
      dynamicTables += resources.grids.length;
      dynamicTableRows += resources.grids.reduce((total, grid) => total + grid.rows.length, 0);
    }

    const summary: MigrationPlanSummary = {
      pages: assigned.pages.length,
      descendants: Math.max(0, assigned.pages.length - 1),
      pagesToCreate: assigned.pages.filter((page) => !state.pages[String(page.source.id)]).length,
      pagesToUpdate: assigned.pages.filter((page) => Boolean(state.pages[String(page.source.id)])).length,
      attachments,
      attachmentBytes,
      dynamicTables,
      dynamicTableRows,
      renamedPages: assigned.renames.length,
      warnings: report.data.warnings.length + previewWarnings,
      links: {
        internal: aggregateStats.internalPageLinks,
        external: aggregateStats.externalLinks,
        attachments: aggregateStats.attachmentLinks,
        anchors: aggregateStats.anchorLinks,
      },
      images: {
        attached: aggregateStats.attachedImages,
        external: aggregateStats.externalImages,
      },
      staticTables: Math.max(0, aggregateStats.tables - dynamicTables),
      codeBlocks: aggregateStats.codeBlocks,
    };
    report.setSummary(summary);
    progress.plan(summary, options.dryRun);

    if (options.dryRun) {
      for (const page of assigned.pages) {
        const resources = metadata.get(page.source.id) ?? {attachments: [], grids: []};
        const plans = attachmentPlans(resources.attachments, state.pages[String(page.source.id)]);
        const converted = previews.get(page.source.id);
        if (!converted) throw new Error(`Missing conversion preview for page ${page.source.id}`);
        converted.warnings.forEach((warning) => {
          report.addWarning(`${page.source.slug}: ${warning}`);
        });
        const attachmentItems = this.plannedAttachments(resources.attachments);
        report.addPage(
          this.reportPage(page, resources, converted, attachmentItems, 'planned', 'storage-fallback'),
          this.reportPreviews(page, converted, renderStoragePreview(converted.storage), 'storage-fallback'),
        );
        progress.item({
          kind: 'dry-run',
          status: 'planned',
          label: page.destinationTitle,
          detail: `${plans.length} attachments · ${resources.grids.length} grids`,
        });
      }
      const reportPaths = await report.write(stateLocation.filename, stateLocation.reportsDirectory);
      logInfo(`Dry-run complete. Report: ${reportPaths.html}; metadata: ${reportPaths.json}`);
      progress.finish({errors: report.data.errors.length, warnings: report.data.warnings.length, reportPaths});
      return {
        hasErrors: report.data.errors.length > 0,
        reportPaths,
        stateId: stateLocation.id,
        stateFilename: stateLocation.filename,
        ...(stateLoad.backupFilename ? {stateBackupFilename: stateLoad.backupFilename} : {}),
      };
    }

    progress.stage('Creating page hierarchy', `${summary.pagesToCreate} new · ${summary.pagesToUpdate} resume/update`);
    const originalMappings = new Set(Object.keys(state.pages));
    logInfo('Creating or resuming destination page skeletons');
    for (const page of assigned.pages) {
      const saved = state.pages[String(page.source.id)];
      const parentId = page.parentSourceId === undefined
        ? target.id
        : state.pages[String(page.parentSourceId)]?.destinationId;
      if (!parentId) {
        const failed = this.failedPage(page, metadata, previews.get(page.source.id), 'Parent destination page was not created');
        report.addPage(failed.page, failed.previews);
        report.addError(`${page.source.slug}: parent destination page was not created`);
        progress.item({kind: 'page skeleton', status: 'failed', label: page.destinationTitle, detail: 'parent unavailable'});
        continue;
      }

      try {
        let destinationId: string;
        if (saved) {
          await confluence.getPage(saved.destinationId);
          destinationId = saved.destinationId;
        } else {
          const created = await confluence.createPage({
            spaceKey,
            parentId,
            title: page.destinationTitle,
            storage: placeholderBody(sourceUrl(config.yandex.webUrl, page.source.slug)),
          });
          destinationId = created.id;
        }
        page.destinationId = destinationId;
        const nextState = pageStateFromPlan(page, destinationId, saved);
        nextState.status = 'created';
        await stateStore.setPage(nextState);
        progress.item({
          kind: 'page skeleton',
          status: saved ? 'reused' : 'created',
          label: page.destinationTitle,
          detail: `pageId ${destinationId}`,
        });
      } catch (error) {
        const message = errorMessage(error, this.secrets);
        const failed = this.failedPage(page, metadata, previews.get(page.source.id), message);
        report.addPage(failed.page, failed.previews);
        report.addError(`${page.source.slug}: ${message}`);
        progress.item({kind: 'page skeleton', status: 'failed', label: page.destinationTitle, detail: message});
      }
    }

    progress.stage('Transferring content', `${summary.attachments} attachments · ${summary.pages} page bodies`);
    logInfo('Uploading resources and writing final page bodies');
    const transferLimit = pLimit(options.concurrency);
    await Promise.all(assigned.pages.map((page) => transferLimit(async () => {
      const pageState = state.pages[String(page.source.id)];
      const resources = metadata.get(page.source.id) ?? {attachments: [], grids: []};
      if (!pageState || !page.destinationId) {
        for (const attachment of resources.attachments) {
          progress.item({kind: 'attachment', status: 'skipped', label: attachment.name, detail: `${page.destinationTitle} · page unavailable`});
        }
        progress.item({kind: 'page content', status: 'skipped', label: page.destinationTitle, detail: 'page unavailable'});
        return;
      }
      const plans = attachmentPlans(resources.attachments, pageState);
      const completedAttachments: Array<{sourceName: string; destinationName: string; downloadUrl?: string}> = [];
      const reportAttachments: ReportAttachment[] = [];
      const pageWarnings: string[] = [];
      let converted = previews.get(page.source.id);

      for (const plan of plans) {
        if (!plan.source.is_downloadable) {
          const warning = `Attachment is not downloadable: ${plan.source.name}`;
          pageWarnings.push(warning);
          report.addWarning(`${page.source.slug}: ${warning}`);
          reportAttachments.push({
            sourceId: plan.source.id,
            sourceName: plan.source.name,
            destinationName: plan.destinationName,
            size: attachmentSize(plan.source),
            status: 'skipped',
            error: warning,
          });
          progress.item({kind: 'attachment', status: 'skipped', label: plan.source.name, detail: `${page.destinationTitle} · not downloadable`});
          continue;
        }
        const key = String(plan.source.id);
        const prior = pageState.attachments[key];
        try {
          const cacheFile = path.join(stateLocation.cacheDirectory, String(page.source.id), `${plan.source.id}-${safeFilename(plan.destinationName)}`);
          const downloaded = await yandex.download(page.source.id, plan.source.id, cacheFile);
          const existing = await confluence.findAttachment(page.destinationId, plan.destinationName);
          let destinationId = existing?.id ?? prior?.destinationId;
          let uploaded = false;
          if (!existing || prior?.sha256 !== downloaded.sha256 || prior.status !== 'complete') {
            const uploadedAttachment = await confluence.uploadAttachment({
              pageId: page.destinationId,
              filename: plan.destinationName,
              file: createReadStream(downloaded.path),
              contentLength: downloaded.size,
              ...(downloaded.mimeType || plan.source.mimetype ? {mimeType: downloaded.mimeType ?? plan.source.mimetype} : {}),
              ...(existing?.id ? {existingAttachmentId: existing.id} : {}),
            });
            destinationId = uploadedAttachment.id;
            uploaded = true;
          }
          const attachmentState: AttachmentState = {
            sourceId: plan.source.id,
            sourceName: plan.source.name,
            ...(destinationId ? {destinationId} : {}),
            destinationName: plan.destinationName,
            sha256: downloaded.sha256,
            size: downloaded.size,
            status: 'complete',
            updatedAt: new Date().toISOString(),
          };
          pageState.attachments[key] = attachmentState;
          await stateStore.setPage(pageState);
          completedAttachments.push({
            sourceName: plan.source.name,
            destinationName: plan.destinationName,
            downloadUrl: plan.source.download_url,
          });
          reportAttachments.push({
            sourceId: plan.source.id,
            sourceName: plan.source.name,
            destinationName: plan.destinationName,
            size: downloaded.size,
            status: uploaded ? 'uploaded' : 'reused',
          });
          progress.item({
            kind: 'attachment',
            status: uploaded ? 'uploaded' : 'reused',
            label: plan.destinationName,
            detail: `${page.destinationTitle} · ${attachmentSize(plan.source)} bytes`,
          });
        } catch (error) {
          const message = errorMessage(error, this.secrets);
          pageState.attachments[key] = {
            sourceId: plan.source.id,
            sourceName: plan.source.name,
            destinationName: plan.destinationName,
            status: 'failed',
            lastError: message,
            updatedAt: new Date().toISOString(),
          };
          await stateStore.setPage(pageState);
          report.addError(`${page.source.slug}/${plan.source.name}: ${message}`);
          pageWarnings.push(`Attachment failed: ${plan.source.name}`);
          reportAttachments.push({
            sourceId: plan.source.id,
            sourceName: plan.source.name,
            destinationName: plan.destinationName,
            size: attachmentSize(plan.source),
            status: 'failed',
            error: message,
          });
          progress.item({kind: 'attachment', status: 'failed', label: plan.destinationName, detail: `${page.destinationTitle} · ${message}`});
        }
      }

      try {
        const context = this.conversionContext(page, spaceKey, pageReferences, completedAttachments);
        converted = this.convertPage(page, resources.grids, context);
        pageWarnings.push(...converted.warnings);
        converted.warnings.forEach((warning) => {
          report.addWarning(`${page.source.slug}: ${warning}`);
        });
        const updated = await confluence.updatePage({
          pageId: page.destinationId,
          title: page.destinationTitle,
          storage: converted.storage,
        });
        const [verified, destinationAttachments] = await Promise.all([
          confluence.getPage(page.destinationId),
          confluence.listAttachments(page.destinationId),
        ]);
        const destinationNames = new Set(destinationAttachments.map((attachment) => attachment.title));
        for (const attachment of completedAttachments) {
          if (!destinationNames.has(attachment.destinationName)) {
            throw new Error(`Uploaded attachment was not found during verification: ${attachment.destinationName}`);
          }
        }
        const verifiedStorage = verified.body?.storage?.value;
        if (!verifiedStorage && converted.storage) {
          throw new Error('Confluence verification response did not include the storage body');
        }
        if (hasMeaningfulStorage(converted.storage) && !hasMeaningfulStorage(verifiedStorage)) {
          throw new Error('Confluence stored an empty page body after the content update');
        }
        pageState.status = 'complete';
        pageState.destinationTitle = page.destinationTitle;
        pageState.sourceSlug = page.source.slug;
        pageState.sourceTitle = page.source.title;
        delete pageState.lastError;
        pageState.updatedAt = new Date().toISOString();
        await stateStore.setPage(pageState);
        const status: ReportPageStatus = originalMappings.has(String(page.source.id)) ? 'updated' : 'created';
        const destinationUrl = confluence.pageWebUrl(updated);
        const destinationView = verified.body?.view?.value;
        const destinationPreviewProvenance: ReportPreviewProvenance = destinationView ? 'confluence-view' : 'storage-fallback';
        report.addPage(
          this.reportPage(page, resources, converted, reportAttachments, status, destinationPreviewProvenance, {
            destinationUrl,
            warnings: pageWarnings,
          }),
          this.reportPreviews(
            page,
            converted,
            destinationView ?? renderStoragePreview(verifiedStorage ?? converted.storage),
            destinationPreviewProvenance,
            destinationUrl,
          ),
        );
        progress.item({
          kind: 'page content',
          status,
          label: page.destinationTitle,
          detail: `${completedAttachments.length} attachments · ${resources.grids.length} grids`,
        });
      } catch (error) {
        const message = errorMessage(error, this.secrets);
        pageState.status = 'failed';
        pageState.lastError = message;
        pageState.updatedAt = new Date().toISOString();
        await stateStore.setPage(pageState);
        const failed = this.failedPage(page, metadata, converted, message, pageWarnings, reportAttachments);
        report.addPage(failed.page, failed.previews);
        report.addError(`${page.source.slug}: ${message}`);
        progress.item({kind: 'page content', status: 'failed', label: page.destinationTitle, detail: message});
      }
    })));

    const reportPaths = await report.write(stateLocation.filename, stateLocation.reportsDirectory);
    const hasErrors = report.data.errors.length > 0;
    logInfo(`Migration complete with ${report.data.errors.length} error(s). Report: ${reportPaths.html}`);
    progress.finish({errors: report.data.errors.length, warnings: report.data.warnings.length, reportPaths});
    return {
      hasErrors,
      reportPaths,
      stateId: stateLocation.id,
      stateFilename: stateLocation.filename,
      ...(stateLoad.backupFilename ? {stateBackupFilename: stateLoad.backupFilename} : {}),
    };
  }

  private conversionContext(
    page: PagePlan,
    spaceKey: string,
    pagesBySlug: Map<string, DestinationPageReference>,
    attachments: Array<{sourceName: string; destinationName: string; downloadUrl?: string}>,
  ): ConversionContext {
    return {
      currentSlug: page.source.slug,
      spaceKey,
      wikiWebUrl: this.dependencies.config.yandex.webUrl,
      pagesBySlug,
      attachmentsByReference: createAttachmentReferenceMap(attachments),
    };
  }

  private convertPage(page: PagePlan, grids: YandexGrid[], context: ConversionContext): ConversionResult {
    if (page.source.content === undefined && grids.length === 0 && !page.source.redirect?.redirect_target) {
      throw new Error(
        `Yandex Wiki API did not return content for ${page.source.slug}; refusing to replace the Confluence body with an empty page`,
      );
    }
    const converted = convertYfmToStorage(page.source.content ?? '', context);
    const warnings = new Set(converted.warnings);
    const stats = emptyConversionStats();
    mergeConversionStats(stats, converted.stats);
    let storage = converted.storage;
    if (page.source.redirect?.redirect_target) {
      const targetSlug = page.source.redirect.redirect_target.slug;
      const mapped = context.pagesBySlug.get(targetSlug.replace(/^\/+|\/+$/g, '').toLocaleLowerCase());
      const href = mapped
        ? `#` // The storage page link below resolves by title without relying on destination IDs.
        : sourceUrl(context.wikiWebUrl, targetSlug);
      storage += mapped
        ? `<p><em>Redirect target:</em> <ac:link><ri:page ri:content-title="${xml(mapped.destinationTitle)}"/><ac:plain-text-link-body><![CDATA[${mapped.destinationTitle}]]></ac:plain-text-link-body></ac:link></p>`
        : `<p><em>Redirect target:</em> <a href="${xml(href)}">${xml(page.source.redirect.redirect_target.title)}</a></p>`;
      if (mapped) stats.internalPageLinks += 1;
      else stats.externalLinks += 1;
    }
    for (const grid of grids) {
      const snapshot = convertGridToStorage(grid, context);
      storage += snapshot.storage;
      snapshot.warnings.forEach((warning) => {
        warnings.add(warning);
      });
      mergeConversionStats(stats, snapshot.stats);
    }
    return {storage, warnings: [...warnings], stats};
  }

  private plannedAttachments(attachments: YandexAttachment[], status: ReportAttachment['status'] = 'planned'): ReportAttachment[] {
    return attachmentPlans(attachments).map((plan) => ({
      sourceId: plan.source.id,
      sourceName: plan.source.name,
      destinationName: plan.destinationName,
      size: attachmentSize(plan.source),
      status,
    }));
  }

  private reportPage(
    page: PagePlan,
    resources: {attachments: YandexAttachment[]; grids: YandexGrid[]},
    converted: ConversionResult | undefined,
    attachmentItems: ReportAttachment[],
    status: ReportPageStatus,
    destinationPreviewProvenance: ReportPreviewProvenance,
    input: {destinationUrl?: string; warnings?: string[]; error?: string} = {},
  ): ReportPage {
    const warnings = input.warnings ?? converted?.warnings ?? [];
    return {
      sourceId: page.source.id,
      sourceSlug: page.source.slug,
      sourceTitle: page.source.title,
      sourceUrl: sourceUrl(this.dependencies.config.yandex.webUrl, page.source.slug),
      ...(page.parentSourceId !== undefined ? {parentSourceId: page.parentSourceId} : {}),
      depth: page.depth,
      ...(page.destinationId ? {destinationId: page.destinationId} : {}),
      destinationTitle: page.destinationTitle,
      ...(input.destinationUrl ? {destinationUrl: input.destinationUrl} : {}),
      status,
      attachments: resources.attachments.length,
      attachmentBytes: attachmentItems.reduce((total, attachment) => total + attachment.size, 0),
      attachmentItems,
      grids: resources.grids.length,
      gridRows: resources.grids.reduce((total, grid) => total + grid.rows.length, 0),
      sourceCharacters: page.source.content?.length ?? 0,
      destinationCharacters: converted?.storage.length ?? 0,
      metrics: converted?.stats ?? emptyConversionStats(),
      destinationPreviewProvenance,
      warnings,
      ...(input.error ? {error: input.error} : {}),
    };
  }

  private reportPreviews(
    page: PagePlan,
    converted: ConversionResult | undefined,
    destinationHtml: string | undefined,
    destinationPreviewProvenance: ReportPreviewProvenance,
    destinationUrl?: string,
  ): ReportPagePreviews {
    const sourcePageUrl = sourceUrl(this.dependencies.config.yandex.webUrl, page.source.slug);
    return {
      source: {
        html: renderYfmPreview(page.source.content ?? ''),
        baseUrl: sourcePageUrl,
        provenance: 'yandex-rendered',
      },
      destination: {
        html: destinationHtml ?? (converted ? renderStoragePreview(converted.storage) : ''),
        baseUrl: destinationUrl ?? this.dependencies.config.confluence.baseUrl,
        provenance: destinationPreviewProvenance,
      },
    };
  }

  private failedPage(
    page: PagePlan,
    metadata: Map<number, {attachments: YandexAttachment[]; grids: YandexGrid[]}>,
    converted: ConversionResult | undefined,
    error: string,
    warnings: string[] = [],
    attachmentItems?: ReportAttachment[],
  ): {page: ReportPage; previews: ReportPagePreviews} {
    const resources = metadata.get(page.source.id) ?? {attachments: [], grids: []};
    const items = attachmentItems ?? this.plannedAttachments(resources.attachments, 'skipped');
    const reportPage = this.reportPage(page, resources, converted, items, 'failed', converted ? 'storage-fallback' : 'unavailable', {
      warnings,
      error,
    });
    return {
      page: reportPage,
      previews: this.reportPreviews(
        page,
        converted,
        converted ? renderStoragePreview(converted.storage) : undefined,
        converted ? 'storage-fallback' : 'unavailable',
      ),
    };
  }
}
