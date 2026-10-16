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
  it('authenticates the current Yandex user with OAuth and IAM organization headers', async () => {
    const oauth = nock('https://api.wiki.yandex.net', {reqheaders: {authorization: 'OAuth wiki-token', 'x-org-id': '42'}})
      .get('/v1/users/me').reply(200, {username: 'operator', identity: {uid: '1'}, org: {dir_id: '42'}});
    await expect(new YandexWikiClient(wiki, 5_000, limits).getCurrentUser()).resolves.toMatchObject({username: 'operator'});

    const iamProfile: YandexConnectionProfile = {
      ...wiki, name: 'cloud', authType: 'iam', token: 'iam-token', organization: {type: 'cloud', id: 'cloud-org'},
    };
    const iam = nock('https://api.wiki.yandex.net', {reqheaders: {authorization: 'Bearer iam-token', 'x-cloud-org-id': 'cloud-org'}})
      .get('/v1/users/me').reply(200, {username: 'cloud-user', identity: {cloud_uid: '2'}, org: {collab_id: 'cloud-org'}});
    await expect(new YandexWikiClient(iamProfile, 5_000, limits).getCurrentUser()).resolves.toMatchObject({username: 'cloud-user'});
    expect(oauth.isDone()).toBe(true);
    expect(iam.isDone()).toBe(true);
  });

  it('authenticates and identifies Confluence Data Center without writes', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/user/current').reply(200, {username: 'operator'})
      .get('/confluence/rest/api/settings/systemInfo').reply(200, {version: '9.5.2'});
    const client = new DataCenterConfluenceClient(dc, 5_000, limits);
    await expect(client.getCurrentUser()).resolves.toMatchObject({username: 'operator'});
    await expect(client.preflight()).resolves.toMatchObject({deployment: 'data-center', version: '9.5.2'});
    expect(api.isDone()).toBe(true);
  });

  it('authenticates and identifies Confluence Cloud without writes', async () => {
    const cloud: ConfluenceConnectionProfile = {
      name: 'cloud', type: 'confluence', deployment: 'cloud', authType: 'api-token', baseUrl: 'https://example.atlassian.net',
      token: 'token', email: 'person@example.com', limits,
    };
    const auth = `Basic ${Buffer.from('person@example.com:token').toString('base64')}`;
    const api = nock('https://example.atlassian.net', {reqheaders: {authorization: auth}})
      .get('/wiki/rest/api/user/current').reply(200, {accountId: 'abc'})
      .get('/wiki/api/v2/spaces').query({limit: 1}).reply(200, {results: []});
    const client = new CloudConfluenceClient(cloud, 5_000, limits);
    await expect(client.getCurrentUser()).resolves.toMatchObject({accountId: 'abc'});
    await expect(client.preflight()).resolves.toMatchObject({deployment: 'cloud'});
    expect(api.isDone()).toBe(true);
  });

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

  it('enumerates every Yandex descendant page, follows short cursor pages, and applies actuality only when requested', async () => {
    const api = nock('https://api.wiki.yandex.net')
      .get('/v1/pages/1/descendants').query({include_self: false, page_size: 100})
      .reply(200, {results: [{id: 2, slug: 'root/one'}], next_cursor: 'next'})
      .get('/v1/pages/1/descendants').query({include_self: false, page_size: 100, cursor: 'next'})
      .reply(200, {results: [{id: 3, slug: 'root/two'}]})
      .get('/v1/pages/1/descendants').query({include_self: false, actuality: 'actual', page_size: 100})
      .reply(200, {results: [{id: 2, slug: 'root/one'}]});
    const client = new YandexWikiClient(wiki, 5_000, limits);
    await expect(client.getDescendants(1)).resolves.toEqual([{id: 2, slug: 'root/one'}, {id: 3, slug: 'root/two'}]);
    await expect(client.getDescendants(1, {actuality: 'actual'})).resolves.toEqual([{id: 2, slug: 'root/one'}]);
    expect(api.isDone()).toBe(true);
  });

  it('rejects repeated Yandex cursors and treats renamed locators as aliases of one immutable ID', async () => {
    const repeated = nock('https://api.wiki.yandex.net')
      .get('/v1/pages/8/descendants').query({include_self: false, page_size: 100})
      .reply(200, {results: [{id: 9, slug: 'root/one'}], next_cursor: 'again'})
      .get('/v1/pages/8/descendants').query({include_self: false, page_size: 100, cursor: 'again'})
      .reply(200, {results: [], next_cursor: 'again'});
    await expect(new YandexWikiClient(wiki, 5_000, limits).getDescendants(8)).rejects.toThrow(/cursor repeated/);
    expect(repeated.isDone()).toBe(true);

    const conflicting = nock('https://api.wiki.yandex.net')
      .get('/v1/pages/18/descendants').query({include_self: false, page_size: 100})
      .reply(200, {results: [{id: 19, slug: 'root/one'}, {id: 19, slug: 'root/renamed'}]});
    await expect(new YandexWikiClient(wiki, 5_000, limits).getDescendants(18)).resolves.toEqual([
      {id: 19, slug: 'root/renamed'},
    ]);
    expect(conflicting.isDone()).toBe(true);
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

  it('sends deployment-specific parent fields when updating Confluence pages', async () => {
    const dcApi = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/10').query({expand: 'space,version,ancestors,body.storage,body.view,operations'})
      .reply(200, {id: '10', type: 'page', title: 'Child', space: {key: 'DOC'}, version: {number: 2}, body: {storage: {value: '<p>x</p>', representation: 'storage'}}})
      .put('/confluence/rest/api/content/10', (body) => body.ancestors?.[0]?.id === '99' && body.version?.number === 3)
      .reply(200, {id: '10', type: 'page', title: 'Child', space: {key: 'DOC'}, ancestors: [{id: '99'}], version: {number: 3}, body: {storage: {value: '<p>x</p>', representation: 'storage'}}});
    await expect(new DataCenterConfluenceClient(dc, 5_000, limits).updatePage({pageId: '10', title: 'Child', storage: '<p>x</p>', parentId: '99'}))
      .resolves.toMatchObject({ancestors: [{id: '99'}]});
    expect(dcApi.isDone()).toBe(true);

    const cloud: ConfluenceConnectionProfile = {
      name: 'cloud-parent', type: 'confluence', deployment: 'cloud', authType: 'api-token', baseUrl: 'https://parent.atlassian.net',
      token: 'token', email: 'person@example.com', limits,
    };
    const cloudApi = nock('https://parent.atlassian.net')
      .get('/wiki/api/v2/pages/10').query({'body-format': 'storage', 'include-operations': true})
      .reply(200, {id: '10', status: 'current', title: 'Child', spaceId: '1', parentId: '1', version: {number: 2}, body: {storage: {value: '<p>x</p>', representation: 'storage'}}})
      .get('/wiki/api/v2/spaces/1').reply(200, {id: '1', key: 'DOC'})
      .put('/wiki/api/v2/pages/10', (body) => body.parentId === '99' && body.version?.number === 3)
      .reply(200, {id: '10', status: 'current', title: 'Child', spaceId: '1', parentId: '99', version: {number: 3}, body: {storage: {value: '<p>x</p>', representation: 'storage'}}});
    await expect(new CloudConfluenceClient(cloud, 5_000, limits).updatePage({pageId: '10', title: 'Child', storage: '<p>x</p>', parentId: '99'}))
      .resolves.toMatchObject({ancestors: [{id: '99'}]});
    expect(cloudApi.isDone()).toBe(true);
  });

  it('finds a Data Center child by exact title across parent-scoped pages', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/100/child/page')
      .query({start: 0, limit: 100, expand: 'space,version,ancestors'})
      .reply(200, {
        results: [{id: '101', type: 'page', title: 'Other', space: {key: 'DOC'}}],
        start: 0, limit: 100, size: 1, _links: {next: '/rest/api/content/100/child/page?start=1'},
      })
      .get('/confluence/rest/api/content/100/child/page')
      .query({start: 1, limit: 100, expand: 'space,version,ancestors'})
      .reply(200, {results: [{id: '102', type: 'page', title: 'Recovered', space: {key: 'DOC'}}], start: 1, limit: 100, size: 1})
      .get('/confluence/rest/api/content/100/child/page')
      .query({start: 0, limit: 100, expand: 'space,version,ancestors'})
      .reply(200, {results: [], start: 0, limit: 100, size: 0});
    const client = new DataCenterConfluenceClient(dc, 5_000, limits);
    await expect(client.findChildPage('100', 'Recovered')).resolves.toMatchObject({id: '102'});
    await expect(client.findChildPage('100', 'Missing')).resolves.toBeUndefined();
    expect(api.isDone()).toBe(true);
  });

  it('propagates a Data Center parent-scoped child lookup error', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/100/child/page')
      .query({start: 0, limit: 100, expand: 'space,version,ancestors'})
      .reply(403, {message: 'forbidden'});
    const client = new DataCenterConfluenceClient(dc, 5_000, limits);
    await expect(client.findChildPage('100', 'Recovered')).rejects.toThrow(/status=403/);
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

  it('reads Yandex comment threads with cursor pagination and creates an archive comment', async () => {
    const api = nock('https://api.wiki.yandex.net', {reqheaders: {authorization: 'OAuth wiki-token', 'x-org-id': '42'}})
      .get('/v1/pages/2/comments').query({order_by: 'created_at', page_size: 100})
      .reply(200, {results: [{id: 10, body: 'Root', author: {uid: 'u1'}}], next_cursor: 'next'})
      .get('/v1/pages/2/comments').query({order_by: 'created_at', page_size: 100, cursor: 'next'})
      .reply(200, {results: [{id: 20, body: 'Second', author: {uid: 'u2'}}]})
      .get('/v1/pages/2/comments/10/thread').query({order_by: 'created_at', page_size: 100})
      .reply(200, {results: [{id: 10, body: 'Root'}, {id: 11, parent_id: 10, body: 'Reply'}]})
      .post('/v1/pages/2/comments', {body: 'Archive'})
      .reply(200, {id: 30, body: 'Archive', author: {uid: 'operator'}});
    const client = new YandexWikiClient(wiki, 5_000, limits);
    await expect(client.getPageComments(2)).resolves.toHaveLength(2);
    await expect(client.getCommentThread(2, '10')).resolves.toHaveLength(2);
    await expect(client.createComment({pageId: 2, body: 'Archive'})).resolves.toMatchObject({id: 30});
    expect(api.isDone()).toBe(true);
  });

  it('reads, creates, updates, and verifies Data Center comments in storage format', async () => {
    const api = nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer conf-token'}})
      .get('/confluence/rest/api/content/10/child/comment')
      .query({start: 0, limit: 100, depth: 'all', expand: 'body.storage,version,history,ancestors,extensions'})
      .reply(200, {results: [{id: 'c1', type: 'comment', body: {storage: {value: '<p>Root</p>', representation: 'storage'}}, version: {number: 1}, history: {createdBy: {userKey: 'u1', displayName: 'User'}}}], size: 1})
      .post('/confluence/rest/api/content', (body) => body.type === 'comment' && body.container?.id === '10')
      .reply(200, {id: 'c2', type: 'comment', body: {storage: {value: '<p>Archive</p>', representation: 'storage'}}, version: {number: 1}})
      .put('/confluence/rest/api/content/c2', (body) => body.version?.number === 2 && body.type === 'comment')
      .reply(200, {id: 'c2', type: 'comment', body: {storage: {value: '<p>Updated</p>', representation: 'storage'}}, version: {number: 2}})
      .get('/confluence/rest/api/content/c2')
      .query({expand: 'body.storage,version,history,ancestors,extensions'})
      .reply(200, {id: 'c2', type: 'comment', body: {storage: {value: '<p>Updated</p>', representation: 'storage'}}, version: {number: 2}});
    const client = new DataCenterConfluenceClient(dc, 5_000, limits);
    await expect(client.getPageComments('10')).resolves.toMatchObject([{id: 'c1', author: {displayName: 'User'}}]);
    await expect(client.createComment({pageId: '10', storage: '<p>Archive</p>'})).resolves.toMatchObject({id: 'c2'});
    await expect(client.updateComment({commentId: 'c2', storage: '<p>Updated</p>', version: 1})).resolves.toMatchObject({version: {number: 2}});
    await expect(client.getComment('c2')).resolves.toMatchObject({body: {storage: {value: '<p>Updated</p>'}}});
    expect(api.isDone()).toBe(true);
  });

  it('reads recursive Cloud footer and inline comments, resolves users, and writes footer archives', async () => {
    const cloud: ConfluenceConnectionProfile = {
      name: 'cloud-comments', type: 'confluence', deployment: 'cloud', authType: 'api-token', baseUrl: 'https://comments.atlassian.net',
      token: 'token', email: 'person@example.com', limits,
    };
    const api = nock('https://comments.atlassian.net')
      .get('/wiki/api/v2/pages/10/footer-comments').query({limit: 100, 'body-format': 'storage'})
      .reply(200, {results: [{id: 'f1', authorId: 'u1', body: {storage: {value: '<p>Root</p>', representation: 'storage'}}}]})
      .get('/wiki/api/v2/pages/10/inline-comments').query({limit: 100, 'body-format': 'storage'})
      .reply(200, {results: []})
      .get('/wiki/api/v2/footer-comments/f1/children').query({limit: 100, 'body-format': 'storage'})
      .reply(200, {results: [{id: 'f2', authorId: 'u2', body: {storage: {value: '<p>Reply</p>', representation: 'storage'}}}]})
      .get('/wiki/api/v2/footer-comments/f2/children').query({limit: 100, 'body-format': 'storage'})
      .reply(200, {results: []})
      .get('/wiki/api/v2/users-bulk').query({'account-ids': 'u1,u2', limit: 100})
      .reply(200, {results: [{accountId: 'u1', displayName: 'One'}, {accountId: 'u2', publicName: 'Two'}]})
      .post('/wiki/api/v2/footer-comments', {pageId: '10', body: {representation: 'storage', value: '<p>Archive</p>'}})
      .reply(200, {id: 'a1', version: {number: 1}, body: {storage: {value: '<p>Archive</p>', representation: 'storage'}}})
      .put('/wiki/api/v2/footer-comments/a1', (body) => body.version?.number === 2)
      .reply(200, {id: 'a1', version: {number: 2}, body: {storage: {value: '<p>Updated</p>', representation: 'storage'}}})
      .get('/wiki/api/v2/footer-comments/a1').query({'body-format': 'storage'})
      .reply(200, {id: 'a1', version: {number: 2}, body: {storage: {value: '<p>Updated</p>', representation: 'storage'}}});
    const client = new CloudConfluenceClient(cloud, 5_000, limits);
    await expect(client.getPageComments('10')).resolves.toMatchObject([
      {id: 'f1', author: {displayName: 'One'}},
      {id: 'f2', parentCommentId: 'f1', author: {publicName: 'Two'}},
    ]);
    await expect(client.createComment({pageId: '10', storage: '<p>Archive</p>'})).resolves.toMatchObject({id: 'a1'});
    await expect(client.updateComment({commentId: 'a1', storage: '<p>Updated</p>', version: 1})).resolves.toMatchObject({version: {number: 2}});
    await expect(client.getComment('a1')).resolves.toMatchObject({body: {storage: {value: '<p>Updated</p>'}}});
    expect(api.isDone()).toBe(true);
  });
});
