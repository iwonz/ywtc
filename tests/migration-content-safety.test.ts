import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, ConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {legacyTransferPlaceholder} from '../src/content-model.js';
import type {DestinationAdapter, DestinationContainer, DestinationPage, SourceAdapter, SourcePage, SourceResource, UploadedResource} from '../src/domain.js';
import type {Logger} from '../src/logger.js';
import {HttpRequestError} from '../src/http.js';
import type {RemoteLocator} from '../src/locators.js';
import {MigrationRunError, Migrator} from '../src/migrator.js';
import type {TransferReportData} from '../src/report.js';
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
const capabilities = {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true};
const logger: Logger = {info: () => undefined, warn: () => undefined, error: () => undefined};

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(descendants: SourcePage[] = [], fixtureRoot: SourcePage = root) {
  let created = 0;
  let updated = 0;
  let failUpload = false;
  let failUpdate = false;
  let failCreatedVerification = false;
  let failRecoveryLookup = false;
  let normalizeBootstrapBody = false;
  let downloads = 0;
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
    resolvePage: async () => fixtureRoot,
    getPage: async (id: string) => id === fixtureRoot.id ? fixtureRoot : descendants.find((page) => page.id === id) ?? fixtureRoot,
    getDescendants: async () => descendants,
    resolveReference: async () => undefined,
    listResources: async (page: SourcePage) => page.id === fixtureRoot.id ? [resource] : [],
    downloadResource: async (_resource: SourceResource, destination: string) => {
      downloads += 1;
      await mkdir(path.dirname(destination), {recursive: true});
      await writeFile(destination, 'file');
      return {path: destination, size: 4, sha256: sha('file'), mimeType: 'application/pdf'};
    },
  } as unknown as SourceAdapter;
  const destination = {
    profile: destinationProfile, kind: 'confluence', capabilities,
    preflight: async () => ({product: 'Confluence', warnings: []}),
    resolveContainer: async () => container,
    findChild: async () => undefined,
    findRecoverablePage: async () => {
      if (failRecoveryLookup) throw new HttpRequestError('No space with key', 404);
      return undefined;
    },
    createPage: async ({container: selectedContainer, title, body}: {container: DestinationContainer | DestinationPage; title: string; body: string}) => {
      created += 1;
      current = page(title, body, String(199 + created), selectedContainer.id);
      pages.set(current.id, current);
      if (failCreatedVerification) missingIds.add(current.id);
      return current;
    },
    updatePage: async ({page: selected, title, body}: {page: DestinationPage; title: string; body: string}) => {
      updated += 1;
      if (failUpdate) throw new Error('destination update unavailable');
      current = page(title, body, selected.id, selected.parentId ?? container.id);
      pages.set(current.id, current);
      return current;
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
    listUploadedResources: async (selected: DestinationPage) => [...(uploaded.get(selected.id)?.values() ?? [])],
  } as unknown as DestinationAdapter;
  return {
    source,
    destination,
    setFailUpload: (value: boolean) => { failUpload = value; },
    setFailUpdate: (value: boolean) => { failUpdate = value; },
    setFailCreatedVerification: (value: boolean) => { failCreatedVerification = value; },
    setFailRecoveryLookup: (value: boolean) => { failRecoveryLookup = value; },
    setNormalizeBootstrapBody: (value: boolean) => { normalizeBootstrapBody = value; },
    setLegacyPlaceholder: () => {
      current = page(current!.title, legacyTransferPlaceholder('confluence', fixtureRoot), current!.id);
      pages.set(current.id, current);
    },
    setCurrentMissing: () => { missingIds.add(current!.id); },
    setAllCurrentMissing: () => { for (const id of pages.keys()) missingIds.add(id); },
    snapshot: () => ({
      created, updated, downloads, current, pages: [...pages.values()],
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
      source, destination, scope: 'page' as const, dryRun: false, archive: false, concurrency: 2,
      runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'),
      reportsDirectory: path.join(directory, '.states/reports'),
    },
  };
}

describe('source-derived remote page safety', () => {
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
    expect(state.pages[root.canonicalId]?.resources[resource.id]?.status).toBe('failed');

    adapters.setFailUpload(false);
    await expect(migrator.run(options)).resolves.toMatchObject({
      status: 'completed', hasErrors: false,
      summary: {pages: 1, complete: 1, resources: 1, resourcesComplete: 1, sourceBytes: 4, bytes: 4},
    });
    expect(adapters.snapshot()).toMatchObject({created: 1, uploaded: 1});
    expect(adapters.snapshot().current?.content).toContain('ri:attachment');
  });

  it('leaves verified bootstrap content when final refinement fails', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.setFailUpdate(true);
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    await expect(new Migrator(config, logger, factory).run(options)).resolves.toMatchObject({status: 'partial', hasErrors: true});
    expect(adapters.snapshot().current?.content).toContain('Important body');
    expect(adapters.snapshot().current?.content).not.toContain('ywtc transfer in progress');
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

  it('reconciles an existing raw source snapshot when its state mapping is unavailable', async () => {
    const {directory, config, options} = await setup();
    const degradedRoot: SourcePage = {
      ...root,
      rawContent: '{% list tabs %}\n\n- First\n\n  Body\n\n- Second\n\n  More\n\n{% endlist %}',
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
    expect(adapters.snapshot().uploaded).toBe(2);
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
    expect(report.issues[0]).toMatchObject({code: 'source-inventory-failed', pageTitle: 'Root', retryable: true});
    expect(adapters.snapshot()).toMatchObject({created: 0, updated: 0, uploaded: 0});
  });
});
