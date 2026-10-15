import {describe, expect, it} from 'vitest';
import {ConfluenceAdapter} from '../src/adapters/confluence.js';
import {YandexAdapter} from '../src/adapters/yandex.js';
import type {YandexWikiClient} from '../src/clients/yandex-wiki.js';
import type {ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import type {ConfluenceApi, ConfluencePage, YandexPageDetails} from '../src/types.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 8, burst: 8};
const yandexProfile: YandexConnectionProfile = {
  name: 'wiki', type: 'yandex-wiki', apiUrl: 'https://api.wiki.example/v1', webUrl: 'https://wiki.example',
  authType: 'oauth', organization: {type: 'yandex360', id: 'org'}, token: 'token', limits,
};
const confluenceProfile: ConfluenceConnectionProfile = {
  name: 'conf', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example/confluence',
  authType: 'pat', token: 'token', limits,
};

describe('source page content contracts', () => {
  it('distinguishes explicit empty Yandex content from a missing content field', async () => {
    const base = {id: 1, slug: 'root', title: 'Root', page_type: 'page'} satisfies YandexPageDetails;
    const missingClient = {getPageBySlug: async () => base} as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, missingClient).resolvePage('root')).rejects.toThrow(/missing content/);
    const emptyClient = {getPageBySlug: async () => ({...base, content: ''})} as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, emptyClient).resolvePage('root')).resolves.toMatchObject({rawContent: ''});
  });

  it('uses the Yandex download URL basename as the preferred resource name', async () => {
    const client = {
      getAttachments: async () => [{
        id: 7, name: 'image.png', is_downloadable: true,
        download_url: 'https://wiki.example/root/.files/image-3.png', size: 0, has_preview: true,
      }],
      getPageGrids: async () => [],
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const resources = await adapter.listResources({
      provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root',
      locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm', references: [],
    });
    expect(resources[0]).toMatchObject({name: 'image.png', preferredName: 'image-3.png'});
    expect(resources[0]?.size).toBeUndefined();
    expect(resources[0]?.referenceAliases).toContain('/root/.files/image-3.png');
  });

  it('requires Confluence Storage Format while allowing an explicitly empty body', async () => {
    const base: ConfluencePage = {id: '1', type: 'page', title: 'Root', space: {key: 'DOC'}};
    const missingClient = {
      resolveTarget: async () => base,
      pageWebUrl: () => 'https://conf.example/confluence/pages/1',
    } as unknown as ConfluenceApi;
    await expect(new ConfluenceAdapter(confluenceProfile, missingClient).resolvePage('1')).rejects.toThrow(/missing body\.storage\.value/);
    const emptyClient = {
      resolveTarget: async () => ({...base, body: {storage: {value: '', representation: 'storage'}}}),
      pageWebUrl: () => 'https://conf.example/confluence/pages/1',
    } as unknown as ConfluenceApi;
    await expect(new ConfluenceAdapter(confluenceProfile, emptyClient).resolvePage('1')).resolves.toMatchObject({rawContent: ''});
  });

  it('recovers a Confluence page by title only under the expected parent', async () => {
    let parentId = 'other-parent';
    const candidate = (): ConfluencePage => ({
      id: '2', type: 'page', title: 'Child', space: {key: 'DOC'}, ancestors: [{id: parentId}],
      body: {storage: {value: '<p>Body</p>', representation: 'storage'}},
    });
    const client = {
      findPageByTitle: async () => candidate(),
      getPage: async () => candidate(),
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const expectedParent = {
      provider: 'confluence' as const, profile: 'conf', id: '100', canonicalId: 'conf:100',
      title: 'Parent', url: 'https://conf.example/confluence/pages/100', space: 'DOC',
    };
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toBeUndefined();
    parentId = expectedParent.id;
    await expect(adapter.findChild(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
  });

  it('prefers parent-scoped Confluence recovery lookup when available', async () => {
    const candidate: ConfluencePage = {
      id: '2', type: 'page', title: 'Child', space: {key: 'DOC'}, ancestors: [{id: '100'}],
      body: {storage: {value: '<p>Body</p>', representation: 'storage'}},
    };
    const client = {
      findChildPage: async () => candidate,
      findPageByTitle: async () => { throw new Error('space lookup must not be used'); },
      getPage: async () => candidate,
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const expectedParent = {
      provider: 'confluence' as const, profile: 'conf', id: '100', canonicalId: 'conf:100',
      title: 'Parent', url: 'https://conf.example/confluence/pages/100', space: 'DOC',
    };
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
  });
});
