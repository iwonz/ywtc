import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, ConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {legacyTransferPlaceholder, rawContentFallback} from '../src/content-model.js';
import {DestinationTitleConflictError, IncompleteSourceDiscoveryError} from '../src/domain.js';
import type {DestinationAdapter, DestinationContainer, DestinationPage, SourceAdapter, SourcePage, SourceResource, UploadedResource} from '../src/domain.js';
import type {Logger} from '../src/logger.js';
import {HttpRequestError} from '../src/http.js';
import {ConfluenceResponseError} from '../src/clients/confluence-response.js';
import type {RemoteLocator} from '../src/locators.js';
import {MigrationRunError, Migrator} from '../src/migrator.js';
import type {TransferReportData} from '../src/report.js';
import {buildRetryPlan} from '../src/retry-plan.js';
import {SourceInventoryOperationError} from '../src/source-inventory.js';
import type {TransferState} from '../src/state.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 50, burst: 50};
const sourceProfile: YandexConnectionProfile = {
  name: 'source', type: 'yandex-wiki', apiUrl: 'https://api.wiki.example/v1', webUrl: 'https://wiki.example',
  authType: 'oauth', organization: {type: 'yandex360', id: 'org'}, token: 'token', limits,
};
const destinationProfile: ConfluenceConnectionProfile = {
  name: 'destination', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example/confluence',
  authType: 'pat', token: 'token', limits,
};
const root: SourcePage = {
  provider: 'yandex-wiki', profile: sourceProfile.name, id: '1', canonicalId: 'source:yandex-wiki:1', title: 'Root',
  locator: 'root', url: 'https://wiki.example/root', rawContent: '# Root\n\nImportant body\n\n[Manual](manual.pdf)', rawFormat: 'yfm',
  references: [{raw: 'manual.pdf', href: 'manual.pdf', kind: 'attachment'}],
};
const child: SourcePage = {
  provider: 'yandex-wiki', profile: sourceProfile.name, id: '2', canonicalId: 'source:yandex-wiki:2', title: 'Child',
  locator: 'root/child', url: 'https://wiki.example/root/child', parentId: root.id,
  rawContent: '# Child\n\nChild body', rawFormat: 'yfm', references: [],
};
const resource: SourceResource = {
  provider: 'yandex-wiki', id: 'a1', pageId: root.id, name: 'manual.pdf', size: 4,
  mimeType: 'application/pdf', downloadUrl: '/download/manual.pdf', kind: 'attachment',
};
const container: DestinationContainer = {
  provider: 'confluence', profile: destinationProfile.name, id: '100', canonicalId: 'destination:confluence:100',
  title: 'Archive', url: 'https://conf.example/confluence/pages/100', space: 'DOC', locator: '100',
};
const capabilities = {
  readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true,
  verifyWrites: true, reparentPages: true, readComments: true, writeComments: true, updateComments: true,
};
const logger: Logger = {info: () => undefined, warn: () => undefined, error: () => undefined};

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(descendants: SourcePage[] = [], fixtureRoot: SourcePage = root, includeRootResource = true) {
  let sourceResource = {...resource};
  let created = 0;
  let updated = 0;
  let reparented = 0;
  let failUpload = false;
  let failUpdate = false;
  let forbiddenUpdateFailures = 0;
  let failCreatedVerification = false;
  let failRecoveryLookup = false;
  let normalizeBootstrapBody = false;
  let globalTitleConflict = false;
  let failAttachmentListing = false;
  let createTitleConflicts = 0;
  let ambiguousCreate = false;
  let stripLinksOnRead = false;
  let stripLinksOnNextUpdatedRead = false;
  let downloads = 0;
  let sourceResolutions = 0;
  let destinationResolutions = 0;
  let destinationPreflightError: Error | undefined;
  const resourceReads = new Map<string, number>();
  const resourceFailures = new Map<string, number>();
  let version = 0;
  const verificationReads = new Map<string, number>();
  let current: DestinationPage | undefined;
  const pages = new Map<string, DestinationPage>();
  const missingIds = new Set<string>();
  const uploaded = new Map<string, Map<string, UploadedResource>>();
  const page = (title: string, body: string, id = current?.id ?? '200', parentId = container.id): DestinationPage => ({
    provider: 'confluence', profile: destinationProfile.name, id, canonicalId: `destination:confluence:${id}`,
    title, url: `https://conf.example/confluence/pages/${id}`, locator: id, space: 'DOC', parentId,
    fingerprint: `version-${++version}`, content: body, contentFingerprint: sha(body), contentLength: Buffer.byteLength(body),
  });
  const source = {
    profile: sourceProfile, kind: 'yandex-wiki', capabilities,
    preflight: async () => ({product: 'Yandex Wiki', warnings: []}),
    resolvePage: async () => {
      sourceResolutions += 1;
      return fixtureRoot;
    },
    getPage: async (id: string) => id === fixtureRoot.id ? fixtureRoot : descendants.find((page) => page.id === id) ?? fixtureRoot,
    getDescendants: async () => descendants,
    resolveReference: async () => undefined,
    listResources: async (page: SourcePage) => {
      resourceReads.set(page.id, (resourceReads.get(page.id) ?? 0) + 1);
      const remaining = resourceFailures.get(page.id) ?? 0;
      if (remaining > 0) {
        resourceFailures.set(page.id, remaining - 1);
        throw new HttpRequestError('provider gateway timed out after bounded retries', 504, 'GET', `/pages/${page.id}/attachments`, undefined, 4);
      }
      return page.id === fixtureRoot.id && includeRootResource ? [sourceResource] : [];
    },
    readComments: async () => ({
      status: 'empty' as const, threads: [], comments: 0, participants: 0, attachments: 0,
      knownBytes: 0, unknownSizes: 0, warnings: [],
    }),
    downloadResource: async (_resource: SourceResource, destination: string) => {
      downloads += 1;
      await mkdir(path.dirname(destination), {recursive: true});
      await writeFile(destination, 'file');
      return {path: destination, size: 4, sha256: sha('file'), mimeType: 'application/pdf'};
    },
  } as unknown as SourceAdapter;
  const destination = {
    profile: destinationProfile, kind: 'confluence', capabilities,
    preflight: async () => {
      if (destinationPreflightError) throw destinationPreflightError;
      return {product: 'Confluence', warnings: []};
    },
    resolveContainer: async () => {
      destinationResolutions += 1;
      return container;
    },
    findChild: async () => undefined,
    findTitleConflict: async (_parent: DestinationContainer | DestinationPage, title: string) => globalTitleConflict && title === root.title
      ? page(title, '<p>Unrelated page</p>', 'unrelated', 'other-parent')
      : undefined,
    findRecoverablePage: async (selectedContainer: DestinationContainer | DestinationPage, title: string) => {
      if (failRecoveryLookup) throw new HttpRequestError('No space with key', 404);
      return [...pages.values()].find((candidate) => candidate.parentId === selectedContainer.id && candidate.title === title);
    },
    createPage: async ({container: selectedContainer, title, body}: {container: DestinationContainer | DestinationPage; title: string; body: string}) => {
      if (createTitleConflicts > 0) {
        createTitleConflicts -= 1;
        throw new DestinationTitleConflictError(title, 400);
      }
      created += 1;
      current = page(title, body, String(199 + created), selectedContainer.id);
      pages.set(current.id, current);
      if (ambiguousCreate) {
        ambiguousCreate = false;
        throw new HttpRequestError('HTTP request failed: status=503: response was lost after create', 503, 'POST');
      }
      if (failCreatedVerification) missingIds.add(current.id);
      return current;
    },
    updatePage: async ({page: selected, title, body}: {page: DestinationPage; title: string; body: string}) => {
      updated += 1;
      if (failUpdate) throw new Error('provider reported a generic conflict while destination update was unavailable');
      if (forbiddenUpdateFailures > 0) {
        forbiddenUpdateFailures -= 1;
        throw new HttpRequestError('HTTP request failed: status=403: request forbidden', 403, 'PUT');
      }
      current = page(title, body, selected.id, selected.parentId ?? container.id);
      pages.set(current.id, current);
      return current;
    },
    reparentPage: async ({page: selected, parent}: {page: DestinationPage; parent: DestinationContainer | DestinationPage}) => {
      reparented += 1;
      const moved = page(selected.title, selected.content ?? '', selected.id, parent.id);
      pages.set(moved.id, moved);
      current = moved;
      return moved;
    },
    verifyPage: async (selected: DestinationPage) => {
      if (missingIds.has(selected.id)) throw new HttpRequestError('No content found', 404);
      let verified = pages.get(selected.id) ?? current!;
      const reads = verificationReads.get(selected.id) ?? 0;
      verificationReads.set(selected.id, reads + 1);
      if (normalizeBootstrapBody && reads > 0 && verified.content && !verified.content.startsWith('\n')) {
        const body = `\n${verified.content}`;
        verified = page(verified.title, body, verified.id, verified.parentId ?? container.id);
        pages.set(verified.id, verified);
        current = verified;
      }
      const stripOnce = stripLinksOnNextUpdatedRead && updated > 0;
      if ((stripLinksOnRead || stripOnce) && verified.content) {
        if (stripOnce) stripLinksOnNextUpdatedRead = false;
        const body = verified.content
          .replace(/<ac:link\b[^>]*>[\s\S]*?<\/ac:link>/gi, 'Manual')
          .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
        verified = page(verified.title, body, verified.id, verified.parentId ?? container.id);
        if (stripLinksOnRead) {
          pages.set(verified.id, verified);
          current = verified;
        }
      }
      return verified;
    },
    uploadResource: async ({page: selected, name, existingId}: {page: DestinationPage; name: string; existingId?: string}) => {
      if (failUpload) throw new Error('attachment upload unavailable');
      const attachments = uploaded.get(selected.id) ?? new Map<string, UploadedResource>();
      const duplicate = [...attachments.values()].find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (duplicate && !existingId) throw new Error(`Cannot add a new attachment with same file name as an existing attachment: ${name}`);
      const value: UploadedResource = {
        id: existingId ?? `uploaded-${name}`,
        name,
        ...(!name.startsWith('ywtc-source-') ? {size: 4} : {}),
      };
      attachments.set(value.id, value);
      uploaded.set(selected.id, attachments);
      return value;
    },
    listUploadedResources: async (selected: DestinationPage) => {
      if (failAttachmentListing) throw new Error('attachment listing forbidden');
      return [...(uploaded.get(selected.id)?.values() ?? [])];
    },
  } as unknown as DestinationAdapter;
  return {
    source,
    destination,
    setFailUpload: (value: boolean) => { failUpload = value; },
    setFailUpdate: (value: boolean) => { failUpdate = value; },
    setForbiddenUpdateFailures: (value: number) => { forbiddenUpdateFailures = value; },
    setFailCreatedVerification: (value: boolean) => { failCreatedVerification = value; },
    setFailRecoveryLookup: (value: boolean) => { failRecoveryLookup = value; },
    setNormalizeBootstrapBody: (value: boolean) => { normalizeBootstrapBody = value; },
    setGlobalTitleConflict: (value: boolean) => { globalTitleConflict = value; },
    setFailAttachmentListing: (value: boolean) => { failAttachmentListing = value; },
    setCreateTitleConflicts: (value: number) => { createTitleConflicts = value; },
    setAmbiguousCreate: () => { ambiguousCreate = true; },
    setStripLinksOnRead: (value: boolean) => { stripLinksOnRead = value; },
    setStripLinksOnNextUpdatedRead: () => { stripLinksOnNextUpdatedRead = true; },
    setDestinationPreflightError: (error: Error) => { destinationPreflightError = error; },
    setResourceFailures: (pageId: string, count: number) => { resourceFailures.set(pageId, count); },
    setLegacyPlaceholder: () => {
      current = page(current!.title, legacyTransferPlaceholder('confluence', fixtureRoot), current!.id);
      pages.set(current.id, current);
    },
    setCurrentBody: (body: string) => {
      current = page(current!.title, body, current!.id, current!.parentId ?? container.id);
      pages.set(current.id, current);
    },
    setCurrentMissing: () => { missingIds.add(current!.id); },
    setAllCurrentMissing: () => { for (const id of pages.keys()) missingIds.add(id); },
    changeResourceDownloadUrl: (downloadUrl: string) => { sourceResource = {...sourceResource, downloadUrl}; },
    snapshot: () => ({
      created, updated, reparented, downloads, sourceResolutions, destinationResolutions, current, pages: [...pages.values()],
      resourceReads: Object.fromEntries(resourceReads),
      uploaded: [...uploaded.values()].reduce((total, items) => total + items.size, 0),
    }),
  };
}

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-content-safety-'));
  const config: AppConfig = {
    profiles: {source: sourceProfile, destination: destinationProfile}, timeoutMs: 5_000, concurrency: 2,
    configFile: path.join(directory, 'ywtc.config.yaml'),
  };
  const source: RemoteLocator = {type: 'remote', profile: sourceProfile, value: 'root'};
  const destination: RemoteLocator = {type: 'remote', profile: destinationProfile, value: '100'};
  return {
    directory,
    config,
    options: {
      source, destination, scope: 'page' as const, dryRun: false, archive: false, comments: false, concurrency: 2,
      runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'),
      reportsDirectory: path.join(directory, '.states/reports'),
    },
  };
}

describe('source-derived remote page safety', () => {
  it('stops at the preflight barrier before locators, state, reports, or writes', async () => {
    const {config, options} = await setup();
    const instance = fixture();
    instance.setDestinationPreflightError(new ConfluenceResponseError(
      'service-unavailable',
      'checking Data Center platform information',
      'Confluence is unavailable or not fully started; retry after attachment storage connectivity is restored.',
    ));
    const factory = (profile: ConnectionProfile) => (profile.type === 'yandex-wiki' ? instance.source : instance.destination) as SourceAdapter & DestinationAdapter;

    await expect(new Migrator(config, logger, factory).run(options)).rejects.toThrow(/unavailable or not fully started/);
    expect(instance.snapshot()).toMatchObject({sourceResolutions: 0, destinationResolutions: 0, created: 0, updated: 0});
    await expect(readdir(options.runtimeDirectory)).rejects.toThrow();
    await expect(readdir(options.reportsDirectory)).rejects.toThrow();
  });

  it('reports every known page when detail discovery is incomplete without destination mutations', async () => {
    const {config, options} = await setup();
    const hydrated = {...child, depth: 1, projectedParentId: root.canonicalId};
    const failed = {
      ...child,
      id: '3',
      canonicalId: 'source:yandex-wiki:3',
      title: 'Unavailable',
      locator: 'root/unavailable',
      url: 'https://wiki.example/root/unavailable',
      depth: 1,
      projectedParentId: root.canonicalId,
    };
    const adapters = fixture([child]);
    adapters.source.getDescendants = async () => {
      throw new IncompleteSourceDiscoveryError(
        'Yandex Wiki descendant inventory is incomplete: 1 of 2 selected page detail request(s) failed',
        [{...root, depth: 0}, hydrated, failed],
        {
          requestedStatus: 'all', effectiveStatus: 'all', returnedDescendants: 2, selectedDescendants: 2,
          excluded: [], maximumDepth: 1, hierarchyGaps: [], notes: ['No destination mutation was attempted.'],
        },
        [{page: failed, code: 'source-page-detail-invalid', message: 'invalid provider content', retryable: false}],
      );
    };
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    let failure: MigrationRunError | undefined;
    try {
      await new Migrator(config, logger, factory).run({...options, scope: 'subtree', comments: true});
    } catch (error) {
      if (error instanceof MigrationRunError) failure = error;
      else throw error;
    }

    expect(failure?.message).toBe('Yandex Wiki descendant inventory is incomplete: 1 of 2 selected page detail request(s) failed');
    expect(adapters.snapshot()).toMatchObject({created: 0, updated: 0, uploaded: 0});
    const report = JSON.parse(await readFile(failure!.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.summary).toMatchObject({
      pages: 3,
      returnedDescendants: 2,
      selectedDescendants: 2,
      failed: 1,
      notStartedPages: 2,
      errors: 1,
      retryableFailures: 0,
      inventoryComplete: false,
      dependentComments: 0,
      commentStatuses: {'not-started': 3},
    });
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'source-page-detail-invalid',
      pageId: failed.canonicalId,
      retryable: false,
    }));
  });

  it('keeps full content with a source fallback when upload fails, then resumes without duplication', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    adapters.setFailUpload(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    const first = await migrator.run(options);
    expect(first).toMatchObject({
      status: 'partial',
      hasErrors: true,
      summary: {pages: 1, partial: 1, resources: 1, resourcesFailed: 1, sourceBytes: 4, bytes: 0, inventoryComplete: true},
    });
    expect(adapters.snapshot().current?.content).toContain('Important body');
    expect(adapters.snapshot().current?.content).toContain('https://wiki.example/download/manual.pdf');
    expect(adapters.snapshot().current?.content).not.toContain('ywtc transfer in progress');

    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    const firstReport = JSON.parse(await readFile(first.reportPaths.json, 'utf8')) as TransferReportData;
    expect(state.runs.at(-1)?.id).toBe(firstReport.runId);
    expect(path.basename(path.dirname(first.reportPaths.html))).toBe(firstReport.runId);
    expect(state.pages[root.canonicalId]?.resources[resource.id]?.status).toBe('failed');

    adapters.setFailUpload(false);
    await expect(migrator.run(options)).resolves.toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {pages: 1, complete: 1, resources: 1, resourcesComplete: 1, sourceBytes: 4, bytes: 4},
    });
    expect(adapters.snapshot()).toMatchObject({created: 1, uploaded: 1});
    expect(adapters.snapshot().current?.content).toContain('ri:attachment');
  });

  it('keeps reporting the active resource while a remote operation is in flight', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    let releaseDownload: (() => void) | undefined;
    let signalDownloadStarted: (() => void) | undefined;
    const downloadGate = new Promise<void>((resolve) => { releaseDownload = resolve; });
    const downloadStarted = new Promise<void>((resolve) => { signalDownloadStarted = resolve; });
    const source = {
      ...adapters.source,
      downloadResource: async (selected: SourceResource, destination: string) => {
        signalDownloadStarted?.();
        await downloadGate;
        return adapters.source.downloadResource(selected, destination);
      },
    } as SourceAdapter;
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const statuses: string[] = [];
    const run = new Migrator(config, logger, factory).run({
      ...options,
      progressHeartbeatMs: 5,
      onStatus: (message) => statuses.push(message),
    });

    await downloadStarted;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statuses).toContainEqual(expect.stringContaining('Still working'));
    expect(statuses).toContainEqual(expect.stringMatching(/active 1: Resource manual\.pdf → Root/));
    expect(statuses.at(-1)).toContain('last completion');

    releaseDownload?.();
    await expect(run).resolves.toMatchObject({status: 'completed'});
    const completedCount = statuses.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statuses).toHaveLength(completedCount);
  });

  it('leaves Plan ready immediately and keeps heartbeat responsive during a CPU-heavy page batch', async () => {
    const descendants = Array.from({length: 24}, (_value, index): SourcePage => ({
      ...child,
      id: `cpu-${index}`,
      canonicalId: `source:yandex-wiki:cpu-${index}`,
      title: `CPU page ${index}`,
      locator: `root/cpu-${index}`,
      url: `https://wiki.example/root/cpu-${index}`,
      rawContent: `# CPU page ${index}\n\n${`Payload ${index} with [reference](https://example.com/${index}). `.repeat(300)}`,
    }));
    const {config, options} = await setup();
    const adapters = fixture(descendants, root, false);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const statuses: string[] = [];

    await expect(new Migrator(config, logger, factory).run({
      ...options,
      scope: 'subtree',
      concurrency: 2,
      progressHeartbeatMs: 1,
      onStatus: (message) => statuses.push(message),
    })).resolves.toMatchObject({status: 'completed', summary: {pages: 25, complete: 25}});

    const plan = statuses.findIndex((message) => message.startsWith('Plan ready:'));
    expect(plan).toBeGreaterThanOrEqual(0);
    expect(statuses[plan + 1]).toContain('Page staging · 0/25 pages');
    expect(statuses).toContainEqual(expect.stringMatching(/Page staging · \d+\/25 pages/));
    expect(statuses).toContainEqual(expect.stringMatching(/Content transfer · \d+\/\d+ operations/));
    expect(statuses).toContainEqual(expect.stringContaining('Still working'));
    expect(adapters.snapshot()).toMatchObject({created: 25});
  });

  it('retries a failed resource through the targeted run chain without recreating the page', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setFailUpload(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    const first = await migrator.run(options);
    const baseline = JSON.parse(await readFile(first.reportPaths.json, 'utf8')) as TransferReportData;
    const plan = buildRetryPlan(baseline);
    expect(plan.pages[root.canonicalId]).toMatchObject({retryPage: false, resourceIds: [resource.id]});

    adapters.setFailUpload(false);
    const retried = await migrator.run({...options, retry: {
      rootRunId: baseline.runId,
      parentRunId: baseline.runId,
      attempt: 1,
      baseline,
      plan,
    }});
    expect(retried).toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {pages: 1, complete: 1, resources: 1, resourcesComplete: 1, resourcesFailed: 0},
    });
    expect(adapters.snapshot()).toMatchObject({
      created: 1,
      downloads: 1,
      uploaded: 1,
      resourceReads: {[root.id]: 2},
    });
    const report = JSON.parse(await readFile(retried.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.retry).toMatchObject({
      rootRunId: baseline.runId, parentRunId: baseline.runId, attempt: 1,
      selectedPages: 1, selectedResources: 1, remainingRetryable: 0,
    });
    expect(report.pages[0]).toMatchObject({
      attemptedInRun: true, outcomeRunId: report.runId,
      resourceItems: [{status: 'complete', attemptedInRun: true, outcomeRunId: report.runId}],
      comments: {status: 'skipped', attemptedInRun: false, outcomeRunId: baseline.runId},
    });
  });

  it('refreshes a targeted resource when its source metadata changed after the baseline run', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setFailUpload(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    const first = await migrator.run(options);
    const baseline = JSON.parse(await readFile(first.reportPaths.json, 'utf8')) as TransferReportData;

    adapters.changeResourceDownloadUrl('/download/manual-revised.pdf');
    adapters.setFailUpload(false);
    const retried = await migrator.run({...options, retry: {
      rootRunId: baseline.runId,
      parentRunId: baseline.runId,
      attempt: 1,
      baseline,
      plan: buildRetryPlan(baseline),
    }});

    expect(retried.status).toBe('completed');
    expect(adapters.snapshot()).toMatchObject({downloads: 2, uploaded: 1});
  });

  it('does not reread or rewrite successful sibling payloads during a targeted retry', async () => {
    const {config, options} = await setup();
    const linkedRoot = {
      ...root,
      rawContent: '# Root\n\n[Child](/root/child)\n\n[Manual](manual.pdf)',
      references: [{raw: '/root/child', href: '/root/child', kind: 'page' as const}, ...root.references],
    };
    const adapters = fixture([child], linkedRoot);
    adapters.setFailUpload(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    const subtree = {...options, scope: 'subtree' as const};
    const first = await migrator.run(subtree);
    const baseline = JSON.parse(await readFile(first.reportPaths.json, 'utf8')) as TransferReportData;
    const plan = buildRetryPlan(baseline);
    expect(plan.retryPageIds).toEqual([root.canonicalId]);
    const before = adapters.snapshot();

    adapters.setFailUpload(false);
    adapters.source.getDescendants = async () => { throw new Error('successful subtree must not be rediscovered'); };
    const retried = await migrator.run({...subtree, retry: {
      rootRunId: baseline.runId,
      parentRunId: baseline.runId,
      attempt: 1,
      baseline,
      plan,
    }});
    const after = adapters.snapshot();
    expect(after.created).toBe(before.created);
    expect(after.updated).toBe(before.updated + 1);
    expect(after.resourceReads[child.id]).toBe(before.resourceReads[child.id]);
    const report = JSON.parse(await readFile(retried.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.pages.find((page) => page.sourceCanonicalId === child.canonicalId)).toMatchObject({
      status: 'complete', attemptedInRun: false, outcomeRunId: baseline.runId,
    });
    expect(report.pages.find((page) => page.sourceCanonicalId === root.canonicalId)).toMatchObject({
      status: 'complete', attemptedInRun: true, outcomeRunId: report.runId,
    });
    expect(after.pages.find((page) => page.title === root.title)?.content).toContain('ri:content-title="Child"');
  });

  it('leaves verified bootstrap content when final refinement fails', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setFailUpdate(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    await expect(new Migrator(config, logger, factory).run(options)).resolves.toMatchObject({
      status: 'partial', hasErrors: true, summary: {partial: 1, conflicts: 0},
    });
    expect(adapters.snapshot().current?.content).toContain('Important body');
    expect(adapters.snapshot().current?.content).not.toContain('ywtc transfer in progress');
  });

  it('checkpoints a created page before strict verification and never duplicates it on rerun', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    adapters.setStripLinksOnRead(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    const first = await migrator.run(options);
    expect(first).toMatchObject({status: 'partial', hasErrors: true});
    const stateName = (await readdir(path.join(directory, '.states'))).find((name) => name.endsWith('.json'))!;
    const firstState = JSON.parse(await readFile(path.join(directory, '.states', stateName), 'utf8')) as TransferState;
    expect(firstState.pages[root.canonicalId]).toMatchObject({destinationId: '200', status: 'failed'});

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'partial', hasErrors: true});
    expect(adapters.snapshot().created).toBe(1);
    const resumedState = JSON.parse(await readFile(path.join(directory, '.states', stateName), 'utf8')) as TransferState;
    expect(resumedState.pages[root.canonicalId]?.destinationId).toBe('200');
  });

  it('refreshes and retries one forbidden update for a proven mapped page', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setForbiddenUpdateFailures(1);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const result = await new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5}).run(options);
    expect(result).toMatchObject({status: 'completed', hasErrors: false, summary: {complete: 1, partial: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 1, updated: 2});
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues).toContainEqual(expect.objectContaining({code: 'destination-update-retry', severity: 'normalization'}));
  });

  it('keeps bootstrap content and reports a persistent mapped update rejection as partial', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setForbiddenUpdateFailures(2);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const result = await new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5}).run(options);
    expect(result).toMatchObject({status: 'partial', hasErrors: true, summary: {partial: 1}});
    expect(adapters.snapshot()).toMatchObject({created: 1, updated: 2});
    expect(adapters.snapshot().current?.content).toContain('Important body');
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'page-transfer-failed', category: 'provider-api', message: expect.stringContaining('request forbidden'),
    }));
  });

  it('recovers late verification against the final rendered body rather than bootstrap references', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setStripLinksOnNextUpdatedRead();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const result = await new Migrator(config, logger, factory).run(options);
    expect(result).toMatchObject({status: 'partial', hasErrors: true, summary: {partial: 1, failed: 0}});
    expect(adapters.snapshot().current?.content).toContain('ri:attachment');
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'destination-content-verification-failed',
      phase: 'verification',
      category: 'verification',
    }));
  });

  it('accepts provider markup normalization between bootstrap creation and final rendering', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setNormalizeBootstrapBody(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const result = await new Migrator(config, logger, factory).run(options);
    expect(result).toMatchObject({status: 'completed', hasErrors: false, summary: {complete: 1, conflicts: 0}});
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.pages[0]?.normalizations).toContain('Destination normalized page markup without semantic content changes');
  });

  it('resolves a space-wide Confluence title conflict before creating a page', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setGlobalTitleConflict(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    await expect(new Migrator(config, logger, factory).run(options)).resolves.toMatchObject({status: 'completed', hasErrors: false});
    expect(adapters.snapshot().current?.title).toBe('Root [root]');
  });

  it('recovers when authoritative page creation finds a title collision missed by lookup', async () => {
    const {config, options} = await setup();
    const adapters = fixture([child]);
    adapters.setCreateTitleConflicts(2);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const transferOptions = {...options, scope: 'subtree' as const, comments: true};
    const result = await new Migrator(config, logger, factory).run(transferOptions);
    expect(result).toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {pages: 2, complete: 2, failed: 0, blocked: 0, resourcesComplete: 1},
    });
    expect(adapters.snapshot().pages.find((page) => page.title.includes('Root'))?.title).toMatch(/^Root \[root-[0-9a-f]{8}\]$/);
    expect(adapters.snapshot()).toMatchObject({created: 2, uploaded: 1});
  });

  it('reconciles an ambiguous create only with source-derived content under the expected parent', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setAmbiguousCreate();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    await expect(new Migrator(config, logger, factory).run(options)).resolves.toMatchObject({
      status: 'completed', hasErrors: false, summary: {complete: 1},
    });
    expect(adapters.snapshot()).toMatchObject({created: 1, uploaded: 1});
  });

  it('reports one root error and causal blocked descendants and files when all titles are occupied', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture([child]);
    adapters.setCreateTitleConflicts(10);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const transferOptions = {...options, scope: 'subtree' as const, comments: true};

    const result = await new Migrator(config, logger, factory).run(transferOptions);
    expect(result).toMatchObject({
      status: 'partial', hasErrors: true,
      summary: {
        pages: 2, failed: 1, blocked: 1, resources: 1, resourcesFailed: 0, resourcesBlocked: 1,
        resourcesPlanned: 0, errors: 1, rootErrors: 1, dependentPages: 1, dependentFiles: 1, dependentComments: 2,
      },
    });
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues.filter((issue) => issue.severity === 'error')).toHaveLength(1);
    expect(report.issues.filter((issue) => issue.severity === 'blocked')).toHaveLength(1);
    expect(report.pages.find((page) => page.sourceCanonicalId === child.canonicalId)).toMatchObject({
      status: 'blocked', blockedByPageId: root.canonicalId, blockedByCode: 'destination-page-staging-failed',
    });
    expect(report.pages.find((page) => page.sourceCanonicalId === root.canonicalId)?.resourceItems[0]).toMatchObject({
      status: 'blocked', blockedByPageId: root.canonicalId, blockedByCode: 'destination-page-staging-failed',
    });
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    expect(state.pages[child.canonicalId]).toMatchObject({status: 'blocked', blockedByPageId: root.canonicalId});
    expect(state.runs.at(-1)).toMatchObject({rootErrors: 1, dependentPages: 1, dependentFiles: 1, dependentComments: 2});

    const resumed = await new Migrator(config, logger, factory).run(transferOptions);
    expect(resumed).toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {complete: 2, failed: 0, blocked: 0, resourcesComplete: 1, resourcesBlocked: 0},
    });
    expect(adapters.snapshot()).toMatchObject({created: 2, uploaded: 1});
  });

  it('does not require attachment-list permission for a page without transferable resources or a snapshot', async () => {
    const {config, options} = await setup();
    const resourceFreeRoot = {...root, rawContent: '# Root\n\nBody', references: []};
    const adapters = fixture([], resourceFreeRoot, false);
    adapters.setFailAttachmentListing(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    await expect(new Migrator(config, logger, factory).run(options)).resolves.toMatchObject({
      status: 'completed', hasErrors: false, summary: {complete: 1, resources: 0},
    });
  });

  it('transfers an empty hierarchy page as complete and repairs its prior managed raw fallback', async () => {
    const {directory, config, options} = await setup();
    const emptyRoot: SourcePage = {...root, rawContent: '### ', references: []};
    const adapters = fixture([], emptyRoot, false);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    const first = await migrator.run(options);
    expect(first).toMatchObject({status: 'completed', hasErrors: false, summary: {complete: 1, partial: 0, resources: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 1, uploaded: 0});
    expect(adapters.snapshot().current?.content).toBe('<p></p>');

    adapters.setCurrentBody(rawContentFallback(emptyRoot, 'confluence', 'renderer returned an empty body for non-empty yfm content').body);
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const stateFilename = path.join(directory, '.states', stateNames[0]!);
    const state = JSON.parse(await readFile(stateFilename, 'utf8')) as TransferState;
    state.pages[emptyRoot.canonicalId]!.destinationFingerprint = adapters.snapshot().current!.fingerprint!;
    state.pages[emptyRoot.canonicalId]!.status = 'partial';
    await writeFile(stateFilename, `${JSON.stringify(state, null, 2)}\n`);

    const resumed = await migrator.run(options);
    expect(resumed).toMatchObject({status: 'completed', hasErrors: false, summary: {complete: 1, partial: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 1, uploaded: 0});
    expect(adapters.snapshot().current?.content).toBe('<p></p>');
  });

  it('transfers unavailable provider Grid content as a readable partial page without blocking the run', async () => {
    const {config, options} = await setup();
    const gridRoot: SourcePage = {
      ...root,
      rawContent: '',
      references: [],
      contentAvailability: {status: 'provider-unavailable', sourceType: 'grid', reason: 'provider-null-body'},
    };
    const adapters = fixture([], gridRoot, false);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;

    const result = await new Migrator(config, logger, factory).run(options);
    expect(result).toMatchObject({
      status: 'completed-with-warnings',
      hasErrors: false,
      summary: {complete: 0, partial: 1, failed: 0, blocked: 0, degradations: 1},
    });
    expect(adapters.snapshot().current?.content).toContain(gridRoot.url);
    expect(adapters.snapshot()).toMatchObject({created: 1});
  });

  it('reconciles an existing raw source snapshot when its state mapping is unavailable', async () => {
    const {directory, config, options} = await setup();
    const degradedRoot: SourcePage = {
      ...root,
      rawContent: '<script>alert("unsafe")</script><p>Important source payload</p>',
      rawFormat: 'confluence-storage',
    };
    const adapters = fixture([], degradedRoot);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed-with-warnings', hasErrors: false});

    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const stateFilename = path.join(directory, '.states', stateNames[0]!);
    const state = JSON.parse(await readFile(stateFilename, 'utf8')) as TransferState;
    const snapshotKey = `snapshot:${root.canonicalId}`;
    const snapshot = state.pages[root.canonicalId]!.resources[snapshotKey]!;
    delete snapshot.destinationId;
    snapshot.status = 'failed';
    snapshot.lastError = 'simulated lost mapping';
    await writeFile(stateFilename, `${JSON.stringify(state, null, 2)}\n`);

    const resumed = await migrator.run(options);
    expect(resumed).toMatchObject({status: 'completed-with-warnings', hasErrors: false, summary: {partial: 1, errors: 0}});
    expect(adapters.snapshot().uploaded).toBe(3);
    const report = JSON.parse(await readFile(resumed.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues).not.toContainEqual(expect.objectContaining({code: 'source-snapshot-transfer-failed'}));
    const resumedState = JSON.parse(await readFile(stateFilename, 'utf8')) as TransferState;
    expect(resumedState.pages[root.canonicalId]?.resources[snapshotKey]).toMatchObject({status: 'complete', destinationId: expect.any(String)});
  });

  it('repairs an exact generated placeholder on rerun without creating another page', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    adapters.setLegacyPlaceholder();

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    expect(adapters.snapshot().created).toBe(1);
    expect(adapters.snapshot().current?.content).toContain('Important body');
    expect(adapters.snapshot().current?.content).not.toContain('ywtc transfer in progress');
  });

  it('recreates a persistently missing confirmed page with bootstrap content and destination history', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5});
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    const oldId = adapters.snapshot().current!.id;
    adapters.setCurrentMissing();

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed-with-warnings', hasErrors: false});
    expect(adapters.snapshot().created).toBe(2);
    expect(adapters.snapshot().uploaded).toBe(2);
    expect(adapters.snapshot().downloads).toBe(1);
    expect(adapters.snapshot().current?.id).not.toBe(oldId);
    expect(adapters.snapshot().current?.content).toContain('Important body');
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    expect(state.pages[root.canonicalId]?.previousDestinationIds).toContain(oldId);
  });

  it('recreates a missing confirmed page when the auxiliary recovery lookup fails', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5});
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    const oldId = adapters.snapshot().current!.id;
    adapters.setCurrentMissing();
    adapters.setFailRecoveryLookup(true);

    const recovered = await migrator.run(options);
    expect(recovered).toMatchObject({status: 'completed-with-warnings', hasErrors: false, summary: {complete: 1, failed: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 2, uploaded: 2, downloads: 1});
    expect(adapters.snapshot().current).toMatchObject({parentId: container.id});
    const report = JSON.parse(await readFile(recovered.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'destination-recovery-lookup-failed', pageTitle: root.title, retryable: true,
    }));
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    expect(state.pages[root.canonicalId]?.previousDestinationIds).toContain(oldId);
  });

  it('recreates a deleted subtree top-down and reuses cached resources', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture([child]);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5});
    const subtreeOptions = {...options, scope: 'subtree' as const};
    await expect(migrator.run(subtreeOptions)).resolves.toMatchObject({
      status: 'completed', summary: {pages: 2, complete: 2, resourcesComplete: 1},
    });
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const before = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    const oldRootId = before.pages[root.canonicalId]!.destinationId;
    const oldChildId = before.pages[child.canonicalId]!.destinationId;
    adapters.setAllCurrentMissing();

    const recovered = await migrator.run(subtreeOptions);
    expect(recovered).toMatchObject({
      status: 'completed-with-warnings', hasErrors: false,
      summary: {pages: 2, complete: 2, failed: 0, blocked: 0, resourcesComplete: 1},
    });
    const after = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    const newRootId = after.pages[root.canonicalId]!.destinationId;
    const newChildId = after.pages[child.canonicalId]!.destinationId;
    expect(newRootId).not.toBe(oldRootId);
    expect(newChildId).not.toBe(oldChildId);
    expect(after.pages[root.canonicalId]?.previousDestinationIds).toContain(oldRootId);
    expect(after.pages[child.canonicalId]?.previousDestinationIds).toContain(oldChildId);
    expect(adapters.snapshot().pages.find((page) => page.id === newChildId)?.parentId).toBe(newRootId);
    expect(adapters.snapshot()).toMatchObject({created: 4, downloads: 1, uploaded: 2});
  });

  it('expands an existing state and moves a formerly projected child below its newly selected parent', async () => {
    const {directory, config, options} = await setup();
    const intermediate: SourcePage = {
      ...child, id: '3', canonicalId: 'source:yandex-wiki:3', title: 'Intermediate', locator: 'root/intermediate',
      parentId: root.id, ancestorIds: [root.id], rawContent: '# Intermediate',
    };
    const leaf: SourcePage = {
      ...child, id: '4', canonicalId: 'source:yandex-wiki:4', title: 'Leaf', locator: 'root/intermediate/leaf',
      parentId: intermediate.id, ancestorIds: [root.id, intermediate.id], rawContent: '# Leaf',
    };
    const descendants = [leaf];
    const adapters = fixture(descendants);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    await expect(migrator.run({...options, scope: 'subtree'})).resolves.toMatchObject({status: 'completed'});
    descendants.unshift(intermediate);
    const resumed = await migrator.run({...options, scope: 'subtree'});
    expect(resumed).toMatchObject({status: 'completed', summary: {pages: 3, hierarchyRepairs: 1}});
    expect(adapters.snapshot().reparented).toBe(1);
    const stateName = (await readdir(path.join(directory, '.states'))).find((name) => name.endsWith('.json'))!;
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateName), 'utf8')) as TransferState;
    expect(state.pages[leaf.canonicalId]?.projectedParentId).toBe(intermediate.canonicalId);
  });

  it('replans earlier false conflict and dependent blocked outcomes without fresh state', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture([child]);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    const subtreeOptions = {...options, scope: 'subtree' as const};
    await expect(migrator.run(subtreeOptions)).resolves.toMatchObject({status: 'completed', summary: {complete: 2}});
    const stateName = (await readdir(path.join(directory, '.states'))).find((name) => name.endsWith('.json'))!;
    const statePath = path.join(directory, '.states', stateName);
    const state = JSON.parse(await readFile(statePath, 'utf8')) as TransferState;
    state.pages[root.canonicalId]!.status = 'conflict';
    state.pages[root.canonicalId]!.destinationFingerprint = 'stale-provider-fingerprint';
    state.pages[root.canonicalId]!.lastError = 'legacy destination conflict';
    state.pages[child.canonicalId]!.status = 'blocked';
    state.pages[child.canonicalId]!.blockedByPageId = root.canonicalId;
    state.pages[child.canonicalId]!.blockedByCode = 'destination-conflict';
    state.pages[child.canonicalId]!.lastError = 'blocked by legacy conflict';
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const resumed = await migrator.run(subtreeOptions);
    expect(resumed).toMatchObject({status: 'completed', hasErrors: false, summary: {complete: 2, conflicts: 0, blocked: 0}});
    const recovered = JSON.parse(await readFile(statePath, 'utf8')) as TransferState;
    expect(recovered.pages[root.canonicalId]).toMatchObject({status: 'complete'});
    expect(recovered.pages[root.canonicalId]?.lastError).toBeUndefined();
    expect(recovered.pages[child.canonicalId]).toMatchObject({status: 'complete'});
    expect(recovered.pages[child.canonicalId]?.blockedByPageId).toBeUndefined();
  });

  it('uses conflict only for proven duplicate immutable destination ownership', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture([child]);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);
    const subtreeOptions = {...options, scope: 'subtree' as const};
    await expect(migrator.run(subtreeOptions)).resolves.toMatchObject({status: 'completed', summary: {complete: 2}});
    const stateName = (await readdir(path.join(directory, '.states'))).find((name) => name.endsWith('.json'))!;
    const statePath = path.join(directory, '.states', stateName);
    const state = JSON.parse(await readFile(statePath, 'utf8')) as TransferState;
    state.pages[child.canonicalId]!.destinationId = state.pages[root.canonicalId]!.destinationId!;
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const result = await migrator.run(subtreeOptions);
    expect(result).toMatchObject({status: 'partial', summary: {conflicts: 1, blocked: 1}});
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.pages.find((page) => page.sourceCanonicalId === root.canonicalId)).toMatchObject({
      status: 'conflict',
      conflictEvidence: {reason: 'duplicate-source-mapping', candidateIds: expect.arrayContaining([root.canonicalId, child.canonicalId])},
    });
    expect(report.pages.find((page) => page.sourceCanonicalId === child.canonicalId)).toMatchObject({
      status: 'blocked', blockedByPageId: root.canonicalId, blockedByCode: 'destination-ownership-ambiguity',
    });
  });

  it('fails safely when a recreated page cannot be confirmed by a repeated read', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5});
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    adapters.setCurrentMissing();
    adapters.setFailCreatedVerification(true);

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'partial', hasErrors: true});
    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    expect(state.pages[root.canonicalId]).toMatchObject({status: 'failed'});
    expect(adapters.snapshot().created).toBe(2);
  });

  it('reports current dry-run failures and planned resources instead of stale successful state', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {sleep: async () => undefined, random: () => 0.5});
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed'});
    adapters.setCurrentMissing();

    const result = await migrator.run({...options, dryRun: true});
    expect(result).toMatchObject({
      status: 'partial',
      hasErrors: true,
      summary: {
        pages: 1, complete: 0, partial: 0, failed: 1, blocked: 0, unprocessedPages: 0,
        resources: 1, resourcesComplete: 0, resourcesFailed: 0, resourcesPlanned: 1,
        sourceBytes: 4, bytes: 0,
      },
    });
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.pages[0]).toMatchObject({
      status: 'failed',
      transferredBytes: 0,
      resourceItems: [{sourceId: resource.id, status: 'planned', sourceBytes: 4}],
    });

    const stateNames = (await readdir(path.join(directory, '.states'))).filter((name) => name.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', stateNames[0]!), 'utf8')) as TransferState;
    expect(state.pages[root.canonicalId]).toMatchObject({status: 'complete', resources: {[resource.id]: {status: 'complete'}}});
  });

  it('keeps every discovered page visible when source inventory fails before mutation', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    const brokenSource = {
      ...adapters.source,
      listResources: async () => { throw new Error('resource inventory unavailable'); },
    } as SourceAdapter;
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? brokenSource : adapters.destination) as SourceAdapter & DestinationAdapter;
    let failure: MigrationRunError | undefined;
    try {
      await new Migrator(config, logger, factory).run(options);
    } catch (error) {
      if (error instanceof MigrationRunError) failure = error;
      else throw error;
    }
    expect(failure).toBeDefined();
    const report = JSON.parse(await readFile(failure!.reportPaths.json, 'utf8')) as TransferReportData;
    expect(report.summary).toMatchObject({
      pages: 1, complete: 0, failed: 1, resources: 0,
      inventoryComplete: false, inventoriedPages: 0, inventoryFailedPages: 1,
      pageStatuses: {failed: 1},
    });
    expect(report.pages[0]).toMatchObject({sourceTitle: 'Root', status: 'failed', inventoryStatus: 'failed'});
    expect(report.issues[0]).toMatchObject({code: 'source-inventory-resources-list', pageTitle: 'Root', retryable: false});
    expect(adapters.snapshot()).toMatchObject({created: 0, updated: 0, uploaded: 0});
  });

  it('recovers a late transient source inventory failure without rereading successful pages', async () => {
    const {config, options} = await setup();
    const adapters = fixture([child], root, false);
    adapters.setResourceFailures(child.id, 1);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const result = await new Migrator(config, logger, factory, {}, {
      delaysMs: [0, 0, 0],
      sleep: async () => undefined,
    }).run({...options, scope: 'subtree'});

    expect(result).toMatchObject({
      status: 'completed',
      summary: {inventoryFreshPages: 2, inventoryReusedPages: 0, inventoryRecoveryAttempts: 1, inventoryRemainingFailures: 0},
    });
    expect(adapters.snapshot()).toMatchObject({created: 2, resourceReads: {'1': 1, '2': 2}});
  });

  it('isolates an exhausted Grid payload and later retries only its resource owner', async () => {
    const {config, options} = await setup();
    const adapters = fixture([child], root, false);
    let gridAvailable = false;
    let gridRefreshes = 0;
    let childResourceReads = 0;
    const failedGrid: SourceResource = {
      provider: 'yandex-wiki', id: 'grid-1', pageId: root.id, name: 'Metrics.grid.json', kind: 'grid', sourceUrl: root.url,
      metadata: {summary: {id: 'grid-1', title: 'Metrics'}},
      inventoryFailure: {
        operation: 'grid-read', code: 'network-inventory-grid-read', message: 'Service unavailable', retryable: true,
        status: 504, endpoint: '/grids/grid-1', attempts: 5,
      },
    };
    const source = {
      ...adapters.source,
      listResources: async (page: SourcePage) => {
        if (page.id === child.id) {
          childResourceReads += 1;
          return [];
        }
        return [failedGrid];
      },
      refreshResource: async (_page: SourcePage, item: SourceResource) => {
        gridRefreshes += 1;
        if (!gridAvailable) {
          throw new SourceInventoryOperationError('grid-read', 'Service unavailable', true, {
            status: 504, endpoint: '/grids/grid-1', attempts: 5,
          });
        }
        const {inventoryFailure: _failure, ...resourceWithoutFailure} = item;
        return {
          ...resourceWithoutFailure,
          metadata: {grid: {title: 'Metrics', structure: {columns: [{title: 'Value'}]}, rows: [{row: ['42']}]}},
        };
      },
    } as SourceAdapter;
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {}, {delaysMs: [0, 0, 0], sleep: async () => undefined});

    const first = await migrator.run({...options, scope: 'subtree'});
    expect(first).toMatchObject({
      status: 'partial', hasErrors: true,
      summary: {pages: 2, complete: 1, partial: 1, resources: 0, grids: 1, gridsComplete: 0, gridsFailed: 1, inventoryComplete: true},
    });
    expect(adapters.snapshot()).toMatchObject({created: 2});
    expect(childResourceReads).toBe(1);
    expect(gridRefreshes).toBe(3);
    const firstReport = JSON.parse(await readFile(first.reportPaths.json, 'utf8')) as TransferReportData;
    expect(firstReport.pages.find((page) => page.sourceCanonicalId === root.canonicalId)).toMatchObject({
      status: 'partial', resourceItems: [{sourceId: 'grid-1', kind: 'grid', status: 'failed'}],
    });
    expect(firstReport.issues).toContainEqual(expect.objectContaining({
      code: 'network-inventory-grid-read', pageId: root.canonicalId, resourceId: 'grid-1', retryable: true,
    }));

    gridAvailable = true;
    const plan = buildRetryPlan(firstReport);
    expect(plan).toMatchObject({retryPageIds: [root.canonicalId], selectedResourceIds: {[root.canonicalId]: ['grid-1']}});
    const retried = await migrator.run({
      ...options,
      scope: 'subtree',
      retry: {rootRunId: firstReport.runId, parentRunId: firstReport.runId, attempt: 1, baseline: firstReport, plan},
    });
    expect(retried).toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {pages: 2, complete: 2, partial: 0, resources: 0, grids: 1, gridsComplete: 1, gridsFailed: 0},
    });
    expect(adapters.snapshot()).toMatchObject({created: 2});
    expect(childResourceReads).toBe(1);
    expect(gridRefreshes).toBe(4);
  });

  it('resumes an exhausted source inventory from retained page checkpoints', async () => {
    const {config, options} = await setup();
    const adapters = fixture([child], root, false);
    adapters.setResourceFailures(child.id, 4);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory, {}, {
      delaysMs: [0, 0, 0],
      sleep: async () => undefined,
    });

    let first: MigrationRunError | undefined;
    try {
      await migrator.run({...options, scope: 'subtree'});
    } catch (error) {
      if (error instanceof MigrationRunError) first = error;
      else throw error;
    }
    expect(first?.message).toMatch(/1\/2 pages checkpointed.*destination mutations: 0.*retry this run/i);
    expect(adapters.snapshot()).toMatchObject({created: 0, resourceReads: {'1': 1, '2': 4}});
    const firstReport = JSON.parse(await readFile(first!.reportPaths.json, 'utf8')) as TransferReportData;
    expect(firstReport.summary).toMatchObject({inventoryFreshPages: 1, inventoryReusedPages: 0, inventoryRecoveryAttempts: 3, inventoryRemainingFailures: 1});

    const resumed = await migrator.run({...options, scope: 'subtree'});
    expect(resumed).toMatchObject({
      status: 'completed',
      summary: {inventoryFreshPages: 1, inventoryReusedPages: 1, inventoryRemainingFailures: 0},
    });
    expect(adapters.snapshot()).toMatchObject({created: 2, resourceReads: {'1': 1, '2': 5}});
  });

  it('reuses a completed dry-run inventory for the confirmed live run', async () => {
    const {config, options} = await setup();
    const adapters = fixture([], root, false);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    const dryRun = await migrator.run({...options, dryRun: true});
    expect(dryRun).toMatchObject({status: 'completed', summary: {inventoryFreshPages: 1, inventoryReusedPages: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 0, resourceReads: {'1': 1}});

    const live = await migrator.run(options);
    expect(live).toMatchObject({status: 'completed', summary: {inventoryFreshPages: 0, inventoryReusedPages: 1}});
    expect(adapters.snapshot()).toMatchObject({created: 1, resourceReads: {'1': 1}});

    const refreshed = await migrator.run({...options, dryRun: true});
    expect(refreshed).toMatchObject({status: 'completed', summary: {inventoryFreshPages: 1, inventoryReusedPages: 0}});
    expect(adapters.snapshot()).toMatchObject({created: 1, resourceReads: {'1': 2}});
  });
});
