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
});
