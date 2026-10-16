import {mkdtemp, readdir, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, ConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import type {
  DestinationAdapter,
  DestinationContainer,
  DestinationPage,
  SourceAdapter,
  SourcePage,
} from '../src/domain.js';
import type {Logger} from '../src/logger.js';
import type {RemoteLocator} from '../src/locators.js';
import {Migrator} from '../src/migrator.js';
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
  locator: 'root', url: 'https://wiki.example/root', rawContent: '# Root', rawFormat: 'yfm', references: [],
};
const container: DestinationContainer = {
  provider: 'confluence', profile: destinationProfile.name, id: '100', canonicalId: 'destination:confluence:100',
  title: 'Archive', url: 'https://conf.example/confluence/pages/100', space: 'DOC', locator: '100',
};
const capabilities = {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true};
const logger: Logger = {info: () => undefined, warn: () => undefined, error: () => undefined};

function fixture() {
  let created = 0;
  let updated = 0;
  let current: DestinationPage | undefined;
  const source = {
    profile: sourceProfile, kind: 'yandex-wiki', capabilities,
    preflight: async () => ({product: 'Yandex Wiki', warnings: []}),
    resolvePage: async () => root,
    getPage: async () => root,
    getDescendants: async () => [],
    resolveReference: async () => undefined,
    listResources: async () => [],
  } as unknown as SourceAdapter & DestinationAdapter;
  const destination = {
    profile: destinationProfile, kind: 'confluence', capabilities,
    preflight: async () => ({product: 'Confluence', warnings: []}),
    resolveContainer: async () => container,
    findChild: async () => undefined,
    createPage: async ({title, body}: {title: string; body: string}) => {
      created += 1;
      current = {
        provider: 'confluence', profile: destinationProfile.name, id: '200', canonicalId: 'destination:confluence:200',
        title, url: 'https://conf.example/confluence/pages/200', locator: '200', space: 'DOC', fingerprint: 'bootstrap',
        parentId: container.id,
        content: body, contentLength: Buffer.byteLength(body),
      };
      return current;
    },
    updatePage: async ({page, title, body}: {page: DestinationPage; title: string; body: string}) => {
      updated += 1;
      current = {...page, title, fingerprint: `body-${updated}`, content: body, contentLength: Buffer.byteLength(body)};
      return current;
    },
    verifyPage: async () => current!,
    uploadResource: async () => ({id: 'resource', name: 'resource'}),
    listUploadedResources: async () => [],
  } as unknown as SourceAdapter & DestinationAdapter;
  return {
    source,
    destination,
    counts: () => ({created, updated}),
    modifyDestination: () => { current = {...current!, fingerprint: 'manual-change'}; },
  };
}

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-resume-'));
  const config: AppConfig = {
    profiles: {source: sourceProfile, destination: destinationProfile}, timeoutMs: 5_000, concurrency: 2,
    configFile: path.join(directory, 'ywtc.config.yaml'),
  };
  const source: RemoteLocator = {type: 'remote', profile: sourceProfile, value: 'root'};
  const destination: RemoteLocator = {type: 'remote', profile: destinationProfile, value: '100'};
  const options = {
    source, destination, scope: 'page' as const, dryRun: false, archive: false, comments: false, concurrency: 2,
    runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'),
    reportsDirectory: path.join(directory, '.states/reports'),
  };
  return {directory, config, options};
}

describe('resume, conflicts, and cancellation', () => {
  it('resumes a mapped page without duplication and protects manual destination edits', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => profile.name === 'source' ? adapters.source : adapters.destination;
    const migrator = new Migrator(config, logger, factory);
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed', hasErrors: false});
    expect(adapters.counts()).toEqual({created: 1, updated: 1});
    adapters.modifyDestination();
    await expect(migrator.run(options)).resolves.toMatchObject({status: 'partial', hasErrors: true});
    expect(adapters.counts()).toEqual({created: 1, updated: 1});
  });

  it('checkpoints a cancelled run before any destination mutation', async () => {
    const {directory, config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => profile.name === 'source' ? adapters.source : adapters.destination;
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));
    await expect(new Migrator(config, logger, factory).run({...options, signal: controller.signal})).rejects.toThrow(/Resource preflight failed/);
    expect(adapters.counts()).toEqual({created: 0, updated: 0});
    const states = (await readdir(path.join(directory, '.states'))).filter((filename) => filename.endsWith('.json'));
    const state = JSON.parse(await readFile(path.join(directory, '.states', states[0]!), 'utf8')) as TransferState;
    expect(state.runs.at(-1)?.status).toBe('cancelled');
  });
});
