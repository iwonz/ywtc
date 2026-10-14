import {Readable} from 'node:stream';
import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import {ConfluenceClient} from '../src/clients/confluence.js';
import {YandexWikiClient} from '../src/clients/yandex-wiki.js';

afterEach(() => nock.cleanAll());

describe('API clients', () => {
  it('paginates Yandex descendants with OAuth and organization headers', async () => {
    const api = nock('https://api.wiki.yandex.net', {
      reqheaders: {authorization: 'OAuth wiki-token', 'x-org-id': '42'},
    })
      .get('/v1/pages/1/descendants')
      .query({actuality: 'actual', include_self: false, page_size: 100})
      .reply(200, {results: [{id: 2, slug: 'root/a'}], next_cursor: 'next'})
      .get('/v1/pages/1/descendants')
      .query({actuality: 'actual', include_self: false, page_size: 100, cursor: 'next'})
      .reply(200, {results: [{id: 3, slug: 'root/b'}]});
    const client = new YandexWikiClient({
      token: 'wiki-token',
      authType: 'oauth',
      orgId: '42',
      orgType: 'yandex360',
      apiUrl: 'https://api.wiki.yandex.net/v1',
      webUrl: 'https://wiki.yandex.ru',
    }, 5_000);

    await expect(client.getDescendants(1)).resolves.toHaveLength(2);
    expect(api.isDone()).toBe(true);
  });

  it('uses Bearer and X-Cloud-Org-Id for Yandex IAM authentication', async () => {
    const api = nock('https://api.wiki.yandex.net', {
      reqheaders: {authorization: 'Bearer iam-token', 'x-cloud-org-id': 'cloud-42'},
    })
      .get('/v1/pages')
      .query({slug: 'root', fields: 'breadcrumbs,redirect,attributes,content'})
      .reply(200, {id: 1, slug: 'root', title: 'Root', page_type: 'wysiwyg', content: 'Body'});
    const client = new YandexWikiClient({
      token: 'iam-token',
      authType: 'iam',
      orgId: 'cloud-42',
      orgType: 'cloud',
      apiUrl: 'https://api.wiki.yandex.net/v1',
      webUrl: 'https://wiki.yandex.ru',
    }, 5_000);

    await expect(client.getPageBySlug('root')).resolves.toMatchObject({id: 1, title: 'Root'});
    expect(api.isDone()).toBe(true);
  });

  it('downloads Yandex attachments through the authenticated permanent-ID endpoint', async () => {
    const api = nock('https://api.wiki.yandex.net', {
      reqheaders: {authorization: 'OAuth wiki-token', 'x-org-id': '42'},
    })
      .get('/v1/pages/1/attachments/10/download')
      .reply(200, 'hello', {'Content-Type': 'text/plain'});
    const client = new YandexWikiClient({
      token: 'wiki-token',
      authType: 'oauth',
      orgId: '42',
      orgType: 'yandex360',
      apiUrl: 'https://api.wiki.yandex.net/v1',
      webUrl: 'https://wiki.yandex.ru',
    }, 5_000);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-download-'));
    const filename = path.join(directory, 'file.txt');

    const result = await client.download(1, 10, filename);
    expect(result).toMatchObject({size: 5, mimeType: 'text/plain'});
    await expect(readFile(filename, 'utf8')).resolves.toBe('hello');
    expect(api.isDone()).toBe(true);
  });

  it('creates Confluence pages with PAT authentication and storage format', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .post('/confluence/rest/api/content', (body) => (
        body.title === 'Root'
        && body.ancestors[0].id === '100'
        && body.body.storage.representation === 'storage'
      ))
      .reply(200, {id: '200', type: 'page', title: 'Root', space: {key: 'DOC'}, version: {number: 1}});
    const client = new ConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'conf-token'}, 5_000);

    const result = await client.createPage({spaceKey: 'DOC', parentId: '100', title: 'Root', storage: '<p>Body</p>'});
    expect(result.id).toBe('200');
    expect(api.isDone()).toBe(true);
  });

  it('requests both storage and rendered Confluence bodies for report comparison', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/200')
      .query({expand: 'space,version,ancestors,body.storage,body.view,operations'})
      .reply(200, {
        id: '200',
        type: 'page',
        title: 'Root',
        space: {key: 'DOC'},
        version: {number: 1},
        body: {
          storage: {value: '<p>Body</p>', representation: 'storage'},
          view: {value: '<p>Body</p>', representation: 'view'},
        },
      });
    const client = new ConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'conf-token'}, 5_000);

    await expect(client.getPage('200')).resolves.toMatchObject({body: {view: {representation: 'view'}}});
    expect(api.isDone()).toBe(true);
  });

  it('uploads attachments using multipart and the nocheck header', async () => {
    const api = nock('https://conf.example.test', {
      reqheaders: {authorization: 'Bearer conf-token', 'x-atlassian-token': 'nocheck'},
    })
      .post('/confluence/rest/api/content/200/child/attachment')
      .query({minorEdit: true})
      .reply(200, {results: [{id: 'att-1', title: 'file.txt'}]});
    const client = new ConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'conf-token'}, 5_000);

    const result = await client.uploadAttachment({
      pageId: '200',
      filename: 'file.txt',
      file: Readable.from('hello'),
      contentLength: 5,
      mimeType: 'text/plain',
    });
    expect(result.id).toBe('att-1');
    expect(api.isDone()).toBe(true);
  });
});
