import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, ConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import type {DestinationAdapter, DestinationContainer, DestinationPage, SourceAdapter, SourcePage, SourceResource, UploadedResource} from '../src/domain.js';
import type {Logger} from '../src/logger.js';
import type {RemoteLocator} from '../src/locators.js';
import {Migrator} from '../src/migrator.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 50, burst: 50};
const sourceProfile: YandexConnectionProfile = {
  name: 'source', type: 'yandex-wiki', apiUrl: 'https://api.wiki.example/v1', webUrl: 'https://wiki.example',
  authType: 'oauth', organization: {type: 'yandex360', id: 'org'}, token: 'token', limits,
};
const destinationProfile: ConfluenceConnectionProfile = {
  name: 'destination', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example/confluence',
  authType: 'pat', token: 'token', limits,
};
const page: SourcePage = {
  provider: 'yandex-wiki', profile: 'source', id: '1', canonicalId: 'source:yandex-wiki:1', title: 'Root',
  locator: 'root', url: 'https://wiki.example/root', rawFormat: 'yfm',
  rawContent: '![First](/root/.files/image.png)\n\n![Second](/root/.files/image-1.png)',
  references: [
    {raw: '/root/.files/image.png', href: '/root/.files/image.png', kind: 'attachment'},
    {raw: '/root/.files/image-1.png', href: '/root/.files/image-1.png', kind: 'attachment'},
  ],
};
const resources: SourceResource[] = [
  {provider: 'yandex-wiki', id: 'one', pageId: '1', name: 'image.png', preferredName: 'image.png', downloadUrl: '/root/.files/image.png', kind: 'image'},
  {provider: 'yandex-wiki', id: 'two', pageId: '1', name: 'image.png', preferredName: 'image-1.png', downloadUrl: '/root/.files/image-1.png', kind: 'image'},
];
const container: DestinationContainer = {
  provider: 'confluence', profile: 'destination', id: '100', canonicalId: 'destination:100', title: 'Archive',
  url: 'https://conf.example/confluence/pages/100', locator: '100', space: 'DOC',
};
const capabilities = {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true};
const logger: Logger = {info: () => undefined, warn: () => undefined, error: () => undefined};

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

describe('migration resource name collisions', () => {
  it('uploads duplicate API names under unique preferred names and keeps references stable on rerun', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-resource-collision-'));
    const uploaded = new Map<string, UploadedResource>();
    const uploadedBodies = new Map<string, Buffer>();
    let current: DestinationPage | undefined;
    let version = 0;
    let downloads = 0;
    let lostResponse = true;
    const destinationPage = (body: string): DestinationPage => ({
      provider: 'confluence', profile: 'destination', id: '200', canonicalId: 'destination:200', title: 'Root',
      url: 'https://conf.example/confluence/pages/200', locator: '200', space: 'DOC', content: body,
      contentFingerprint: hash(body), fingerprint: `v${++version}`,
    });
    const source = {
      profile: sourceProfile, kind: 'yandex-wiki', capabilities,
      preflight: async () => ({product: 'Yandex Wiki', warnings: []}), resolvePage: async () => page,
      getPage: async () => page, getDescendants: async () => [], resolveReference: async () => undefined,
      listResources: async () => resources,
      downloadResource: async (resource: SourceResource, destination: string) => {
        downloads += 1;
        const body = Buffer.from(resource.id === 'one' ? 'first' : 'second');
        await mkdir(path.dirname(destination), {recursive: true});
        await writeFile(destination, body);
        return {path: destination, size: body.length, sha256: hash(body.toString())};
      },
    } as unknown as SourceAdapter;
    const destination = {
      profile: destinationProfile, kind: 'confluence', capabilities,
      preflight: async () => ({product: 'Confluence', warnings: []}), resolveContainer: async () => container,
      findChild: async () => undefined,
      createPage: async ({body}: {body: string}) => { current = destinationPage(body); return current; },
      updatePage: async ({body}: {body: string}) => { current = destinationPage(body); return current; },
      verifyPage: async () => current!,
      listUploadedResources: async () => [...uploaded.values()],
      uploadResource: async ({name, size, filePath}: {name: string; size?: number; filePath: string}) => {
        if ([...uploaded.values()].some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error(`duplicate ${name}`);
        const result = {id: `destination-${name}`, name, ...(size !== undefined ? {size} : {})};
        uploaded.set(result.id, result);
        uploadedBodies.set(result.id, await readFile(filePath));
        if (name === 'image-1.png' && lostResponse) {
          lostResponse = false;
          throw new Error('connection closed after upload');
        }
        return result;
      },
      downloadUploadedResource: async ({resource, destination}: {resource: UploadedResource; destination: string}) => {
        const body = uploadedBodies.get(resource.id)!;
        await writeFile(destination, body);
        return {path: destination, size: body.length, sha256: hash(body.toString())};
      },
    } as unknown as DestinationAdapter;
    const config: AppConfig = {
      profiles: {source: sourceProfile, destination: destinationProfile}, timeoutMs: 5_000, concurrency: 2,
      configFile: path.join(directory, 'ywtc.config.yaml'),
    };
    const options = {
      source: {type: 'remote', profile: sourceProfile, value: 'root'} as RemoteLocator,
      destination: {type: 'remote', profile: destinationProfile, value: '100'} as RemoteLocator,
      scope: 'page' as const, dryRun: false, archive: false, concurrency: 2,
      runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'),
      reportsDirectory: path.join(directory, '.states/reports'),
    };
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? source : destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, logger, factory);

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed', hasErrors: false});
    expect([...uploaded.values()].map((item) => item.name).sort()).toEqual(['image-1.png', 'image.png']);
    expect(current?.content).toContain('ri:filename="image.png"');
    expect(current?.content).toContain('ri:filename="image-1.png"');

    await expect(migrator.run(options)).resolves.toMatchObject({status: 'completed', hasErrors: false});
    expect(uploaded).toHaveLength(2);
    expect(downloads).toBe(2);
  });
});
