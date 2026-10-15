import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {createLogger} from '../src/logger.js';
import type {RemoteLocator} from '../src/locators.js';
import {Migrator} from '../src/migrator.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 50, burst: 50};
const wiki = (name: string, host: string, org: string): YandexConnectionProfile => ({
  name, type: 'yandex-wiki', apiUrl: `${host}/v1`, webUrl: host.replace('api.', 'wiki.'), authType: 'oauth',
  organization: {type: 'yandex360', id: org}, token: `${name}-token`, limits,
});
const confluence = (name: string, host: string): ConfluenceConnectionProfile => ({
  name, type: 'confluence', deployment: 'data-center', baseUrl: `${host}/confluence`, authType: 'pat',
  token: `${name}-token`, limits,
});

function mockWikiSource(profile: YandexConnectionProfile, id = 1, slug = 'root') {
  const api = new URL(profile.apiUrl);
  return nock(api.origin, {reqheaders: {authorization: `OAuth ${profile.token}`, 'x-org-id': profile.organization.id}})
    .get(`${api.pathname}/pages`).query({slug, fields: 'breadcrumbs,redirect,attributes,content'})
    .reply(200, {id, slug, title: 'Root', page_type: 'page', content: '# Root\n\nBody'})
    .get(`${api.pathname}/pages/${id}/attachments`).query({order_by: 'name', page_size: 100}).reply(200, {results: []})
    .get(`${api.pathname}/pages/${id}/grids`).query({order_by: 'created_at', page_size: 100}).reply(200, {results: []});
}

function mockWikiDestination(profile: YandexConnectionProfile, id = 100, slug = 'archive') {
  const api = new URL(profile.apiUrl);
  return nock(api.origin, {reqheaders: {authorization: `OAuth ${profile.token}`, 'x-org-id': profile.organization.id}})
    .get(`${api.pathname}/pages`).query({slug, fields: 'breadcrumbs,redirect,attributes,content'})
    .reply(200, {id, slug, title: 'Archive', page_type: 'page', content: ''})
    .get(`${api.pathname}/pages/${id}`).query({fields: 'breadcrumbs,redirect,attributes,content'})
    .reply(200, {id, slug, title: 'Archive', page_type: 'page', content: ''});
}

function mockConfluenceSource(profile: ConfluenceConnectionProfile, id = '10') {
  return nock(new URL(profile.baseUrl).origin, {reqheaders: {authorization: `Bearer ${profile.token}`}})
    .get('/confluence/rest/api/settings/systemInfo').reply(200, {version: '9.2.0'})
    .get(`/confluence/rest/api/content/${id}`).query({expand: 'space,version,ancestors,body.storage,body.view,operations'})
    .reply(200, {id, type: 'page', title: 'Root', space: {key: 'DOC'}, version: {number: 1}, body: {storage: {value: '<h1>Root</h1><p>Body</p>', representation: 'storage'}}})
    .get(`/confluence/rest/api/content/${id}/child/attachment`).query({start: 0, limit: 100, expand: 'extensions,metadata'})
    .reply(200, {results: [], size: 0});
}

function mockConfluenceDestination(profile: ConfluenceConnectionProfile, id = '100') {
  return nock(new URL(profile.baseUrl).origin, {reqheaders: {authorization: `Bearer ${profile.token}`}})
    .get('/confluence/rest/api/settings/systemInfo').reply(200, {version: '11.0.0'})
    .get(`/confluence/rest/api/content/${id}`).query({expand: 'space,version,ancestors,body.storage,body.view,operations'})
    .reply(200, {id, type: 'page', title: 'Archive', space: {key: 'DOC'}, version: {number: 1}, body: {storage: {value: '<p>Archive</p>', representation: 'storage'}}});
}

afterEach(() => nock.cleanAll());

describe('four remote transfer directions', () => {
  const cases = [
    ['Yandex Wiki → Confluence', wiki('wiki-source', 'https://api.wiki-source.example', 'org-a'), confluence('conf-dest', 'https://conf-dest.example')],
    ['Yandex Wiki → Yandex Wiki', wiki('wiki-source', 'https://api.wiki-source.example', 'org-a'), wiki('wiki-dest', 'https://api.wiki-dest.example', 'org-b')],
    ['Confluence → Yandex Wiki', confluence('conf-source', 'https://conf-source.example'), wiki('wiki-dest', 'https://api.wiki-dest.example', 'org-b')],
    ['Confluence → Confluence', confluence('conf-source', 'https://conf-source.example'), confluence('conf-dest', 'https://conf-dest.example')],
  ] as const;

  for (const [label, sourceProfile, destinationProfile] of cases) {
    it(`${label} completes a mutation-free dry-run`, async () => {
      const sourceMock = sourceProfile.type === 'yandex-wiki' ? mockWikiSource(sourceProfile) : mockConfluenceSource(sourceProfile);
      const destinationMock = destinationProfile.type === 'yandex-wiki' ? mockWikiDestination(destinationProfile) : mockConfluenceDestination(destinationProfile);
      const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-matrix-'));
      const config: AppConfig = {
        profiles: {[sourceProfile.name]: sourceProfile, [destinationProfile.name]: destinationProfile},
        timeoutMs: 5_000,
        concurrency: 2,
        configFile: path.join(directory, 'ywtc.config.yaml'),
      };
      const source: RemoteLocator = {
        type: 'remote', profile: sourceProfile,
        value: sourceProfile.type === 'yandex-wiki' ? `${sourceProfile.webUrl}/root` : `${sourceProfile.baseUrl}/pages/viewpage.action?pageId=10`,
      };
      const destination: RemoteLocator = {
        type: 'remote', profile: destinationProfile,
        value: destinationProfile.type === 'yandex-wiki' ? `${destinationProfile.webUrl}/archive` : `${destinationProfile.baseUrl}/pages/viewpage.action?pageId=100`,
      };
      const result = await new Migrator(config, createLogger([])).run({
        source, destination, scope: 'page', dryRun: true, archive: false, concurrency: 2,
        runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'),
        reportsDirectory: path.join(directory, '.states/reports'),
      });
      expect(result.status).toMatch(/completed/);
      expect(result.hasErrors).toBe(false);
      expect(sourceMock.isDone()).toBe(true);
      expect(destinationMock.isDone()).toBe(true);
    });
  }
});
