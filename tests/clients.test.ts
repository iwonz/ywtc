import {Readable} from 'node:stream';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import {CloudConfluenceClient} from '../src/clients/confluence-cloud.js';
import {DataCenterConfluenceClient} from '../src/clients/confluence.js';
import {YandexWikiClient} from '../src/clients/yandex-wiki.js';
import type {ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 20, burst: 20};
const wiki: YandexConnectionProfile = {
  name: 'wiki', type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: 'https://wiki.example.com',
  authType: 'oauth', organization: {type: 'yandex360', id: '42'}, token: 'wiki-token', limits,
};
const dc: ConfluenceConnectionProfile = {
  name: 'dc', type: 'confluence', deployment: 'data-center', authType: 'pat', baseUrl: 'https://conf.example.test/confluence',
  token: 'conf-token', limits,
};

afterEach(() => nock.cleanAll());

describe('provider clients', () => {
  it('creates and updates Yandex pages with OAuth organization headers', async () => {
    const api = nock('https://api.wiki.yandex.net', {reqheaders: {authorization: 'OAuth wiki-token', 'x-org-id': '42'}})
      .post('/v1/pages', {slug: 'root/child', title: 'Child', content: 'Body', access_policy: {access_type: 'inherited'}})
      .query({is_silent: true, fields: 'breadcrumbs,redirect,attributes,content'})
      .reply(200, {id: 2, slug: 'root/child', title: 'Child', page_type: 'page', content: 'Body'})
      .post('/v1/pages/2', {title: 'Child', content: 'Updated'})
      .query({allow_merge: false, is_silent: true, fields: 'breadcrumbs,redirect,attributes,content'})
      .reply(200, {id: 2, slug: 'root/child', title: 'Child', page_type: 'page', content: 'Updated'});
    const client = new YandexWikiClient(wiki, 5_000, limits);
    await expect(client.createPage({slug: 'root/child', title: 'Child', content: 'Body'})).resolves.toMatchObject({id: 2});
    await expect(client.updatePage({id: 2, title: 'Child', content: 'Updated'})).resolves.toMatchObject({content: 'Updated'});
    expect(api.isDone()).toBe(true);
  });

  it('streams Yandex upload sessions in documented order', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-upload-'));
    const filename = path.join(directory, 'file.txt');
    await writeFile(filename, 'hello');
    const api = nock('https://api.wiki.yandex.net')
      .post('/v1/upload_sessions', {file_name: 'file.txt', file_size: 5}).reply(200, {session_id: 'session-1'})
      .put('/v1/upload_sessions/session-1/upload_part', 'hello').query({part_number: 1}).reply(200, {})
      .post('/v1/upload_sessions/session-1/finish').reply(200, {status: 'ok'})
      .post('/v1/pages/2/attachments', {upload_sessions: ['session-1']}).reply(200, {
        results: [{id: 7, name: 'file.txt', is_downloadable: true, download_url: '/file', size: 5}],
      });
    await expect(new YandexWikiClient(wiki, 5_000, limits).uploadAttachment({pageId: 2, filename: 'file.txt', path: filename, size: 5})).resolves.toMatchObject({id: 7});
    expect(api.isDone()).toBe(true);
  });

  it('reads Data Center descendants and streams attachment downloads', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/10/descendant/page')
      .query({start: 0, limit: 100, expand: 'space,version,ancestors,body.storage,body.view'})
      .reply(200, {results: [{id: '11', type: 'page', title: 'Child', space: {key: 'DOC'}, body: {storage: {value: '<p>x</p>', representation: 'storage'}}}]})
      .get('/confluence/download/attachments/10/file.txt').reply(200, 'hello', {'Content-Type': 'text/plain'});
    const client = new DataCenterConfluenceClient(dc, 5_000, limits);
    await expect(client.getDescendants('10')).resolves.toHaveLength(1);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-conf-download-'));
    const destination = path.join(directory, 'file.txt');
    await expect(client.downloadAttachment('10', {id: 'a', title: 'file.txt', _links: {download: '/download/attachments/10/file.txt'}}, destination)).resolves.toMatchObject({size: 5});
    await expect(readFile(destination, 'utf8')).resolves.toBe('hello');
    expect(api.isDone()).toBe(true);
  });

  it('uses Cloud v2 pages and v1 multipart attachments', async () => {
    const cloud: ConfluenceConnectionProfile = {
      name: 'cloud', type: 'confluence', deployment: 'cloud', authType: 'api-token', baseUrl: 'https://example.atlassian.net',
      token: 'token', email: 'person@example.com', limits,
    };
    const auth = `Basic ${Buffer.from('person@example.com:token').toString('base64')}`;
    const api = nock('https://example.atlassian.net', {reqheaders: {authorization: auth}})
      .get('/wiki/api/v2/spaces/1').reply(200, {id: '1', key: 'DOC'})
      .get('/wiki/api/v2/pages/10').query({'body-format': 'storage', 'include-operations': true})
      .reply(200, {id: '10', title: 'Root', spaceId: '1', body: {storage: {value: '<p>x</p>', representation: 'storage'}}})
      .post('/wiki/rest/api/content/10/child/attachment').reply(200, {results: [{id: 'a', title: 'file.txt'}]});
    const client = new CloudConfluenceClient(cloud, 5_000, limits);
    await expect(client.getPage('10')).resolves.toMatchObject({space: {key: 'DOC'}});
    await expect(client.uploadAttachment({pageId: '10', filename: 'file.txt', file: Readable.from('hello'), contentLength: 5})).resolves.toMatchObject({id: 'a'});
    expect(api.isDone()).toBe(true);
  });
});
