import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import {CloudConfluenceClient} from '../src/clients/confluence-cloud.js';
import {DataCenterConfluenceClient} from '../src/clients/confluence.js';
import type {AppConfig, NetworkLimits} from '../src/config.js';

const limits: NetworkLimits['confluence'] = {
  readConcurrency: 4, writeConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 100, burst: 100,
};

afterEach(() => nock.cleanAll());

describe('Confluence compatibility adapters', () => {
  it.each(['7.9.0', '8.9.1', '9.5.2', '10.2.0', '11.0.0'])('accepts Data Center %s by contract', async (version) => {
    nock('https://conf.example.test', {reqheaders: {authorization: 'Bearer token'}})
      .get('/confluence/rest/api/settings/systemInfo')
      .reply(200, {version, buildNumber: '123'});
    const client = new DataCenterConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'token'}, 5_000, limits);
    await expect(client.preflight()).resolves.toMatchObject({deployment: 'data-center', version});
  });

  it('rejects a known Data Center version below 7.9', async () => {
    nock('https://conf.example.test').get('/confluence/rest/api/settings/systemInfo').reply(200, {version: '7.8.4'});
    const client = new DataCenterConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'token'}, 5_000, limits);
    await expect(client.preflight()).rejects.toThrow(/requires 7\.9\+/);
  });

  it.each([403, 404])('falls back to required Data Center capabilities when system info returns %s', async (status) => {
    const api = nock('https://conf.example.test')
      .get('/confluence/rest/api/settings/systemInfo').reply(status)
      .get('/confluence/rest/api/content')
      .query({type: 'page', status: 'current', limit: 1, expand: 'space,version,body.storage'})
      .reply(200, {results: []});
    const client = new DataCenterConfluenceClient({baseUrl: 'https://conf.example.test/confluence', token: 'token'}, 5_000, limits);
    await expect(client.preflight()).resolves.toEqual({
      deployment: 'data-center', product: 'Confluence Data Center', api: '/rest/api',
    });
    expect(api.isDone()).toBe(true);
  });

  it('uses Cloud REST v2 with Basic auth and normalizes space identity', async () => {
    const authorization = `Basic ${Buffer.from('person@example.com:api-token').toString('base64')}`;
    const api = nock('https://example.atlassian.net', {reqheaders: {authorization}})
      .get('/wiki/api/v2/spaces').query({limit: 1}).reply(200, {results: [{id: 'space-1', key: 'DOC'}]})
      .get('/wiki/api/v2/pages/123').query({'body-format': 'storage', 'include-operations': true}).reply(200, {
        id: '123', status: 'current', title: 'Parent', spaceId: 'space-1', version: {number: 4},
        body: {storage: {value: '<p>Body</p>', representation: 'storage'}},
      })
      .get('/wiki/api/v2/spaces/space-1').reply(200, {id: 'space-1', key: 'DOC', name: 'Docs'});
    const config: AppConfig['confluence'] = {
      deployment: 'cloud', authType: 'api-token', baseUrl: 'https://example.atlassian.net',
      email: 'person@example.com', token: 'api-token',
    };
    const client = new CloudConfluenceClient(config, 5_000, limits);
    await expect(client.preflight()).resolves.toMatchObject({deployment: 'cloud'});
    await expect(client.resolveTarget('https://example.atlassian.net/wiki/spaces/DOC/pages/123/Parent')).resolves.toMatchObject({
      id: '123', space: {id: 'space-1', key: 'DOC'}, body: {storage: {representation: 'storage'}},
    });
    expect(api.isDone()).toBe(true);
  });

  it('creates and updates Cloud storage pages with REST v2 payloads', async () => {
    const api = nock('https://example.atlassian.net')
      .get('/wiki/api/v2/spaces').query({keys: 'DOC', limit: 2}).reply(200, {results: [{id: 'space-1', key: 'DOC'}]})
      .post('/wiki/api/v2/pages', (body) => body.spaceId === 'space-1' && body.parentId === '123' && body.body.representation === 'storage')
      .reply(200, {id: '200', title: 'Child', status: 'current', spaceId: 'space-1', parentId: '123', version: {number: 1}})
      .get('/wiki/api/v2/pages/200').query({'body-format': 'storage', 'include-operations': true})
      .reply(200, {id: '200', title: 'Child', status: 'current', spaceId: 'space-1', version: {number: 1}})
      .put('/wiki/api/v2/pages/200', (body) => body.version.number === 2 && body.body.value === '<p>Updated</p>')
      .reply(200, {id: '200', title: 'Child', status: 'current', spaceId: 'space-1', version: {number: 2}});
    const client = new CloudConfluenceClient({
      deployment: 'cloud', authType: 'api-token', baseUrl: 'https://example.atlassian.net/wiki',
      email: 'person@example.com', token: 'api-token',
    }, 5_000, limits);
    await expect(client.createPage({spaceKey: 'DOC', parentId: '123', title: 'Child', storage: '<p>Body</p>'})).resolves.toMatchObject({id: '200'});
    await expect(client.updatePage({pageId: '200', title: 'Child', storage: '<p>Updated</p>'})).resolves.toMatchObject({version: {number: 2}});
    expect(api.isDone()).toBe(true);
  });
});
