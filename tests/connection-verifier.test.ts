import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import {
  classifyConnectionFailure,
  ConnectionVerificationError,
  verifyConnection,
  verifyConnections,
} from '../src/connection-verifier.js';
import type {AppConfig, ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {HttpRequestError} from '../src/http.js';
import {ConfluenceResponseError} from '../src/clients/confluence-response.js';

const limits: NetworkLimits = {
  readConcurrency: 2, writeConcurrency: 1, downloadConcurrency: 1, uploadConcurrency: 1, requestsPerSecond: 20, burst: 20,
};
const yandex: YandexConnectionProfile = {
  name: 'yandex', type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: 'https://wiki.example.com',
  authType: 'oauth', token: 'very-secret-yandex-token', organization: {type: 'yandex360', id: '42'}, limits,
};
const confluence: ConfluenceConnectionProfile = {
  name: 'confluence', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example.test/confluence',
  authType: 'pat', token: 'very-secret-confluence-token', limits,
};
const config: AppConfig = {
  configFile: '/tmp/ywtc.config.yaml', timeoutMs: 5_000, concurrency: 2,
  profiles: {yandex, confluence},
};

afterEach(() => nock.cleanAll());

describe('connection verification', () => {
  it('verifies both providers through read-only identity and platform requests', async () => {
    const wikiApi = nock('https://api.wiki.yandex.net').get('/v1/users/me')
      .reply(200, {username: 'operator', identity: {uid: '1'}, org: {dir_id: '42'}});
    const confluenceApi = nock('https://conf.example.test')
      .get('/confluence/rest/api/user/current').reply(200, {username: 'operator'})
      .get('/confluence/rest/api/settings/systemInfo').reply(200, {version: '11.0.0'});

    await expect(verifyConnections(config, yandex, confluence)).resolves.toEqual([
      {profile: 'yandex', provider: 'yandex-wiki', product: 'Yandex Wiki Public API v1'},
      {profile: 'confluence', provider: 'confluence', product: 'Confluence Data Center', version: '11.0.0'},
    ]);
    expect(wikiApi.isDone()).toBe(true);
    expect(confluenceApi.isDone()).toBe(true);
  });

  it('classifies provider failures without exposing credentials', async () => {
    nock('https://api.wiki.yandex.net').get('/v1/users/me')
      .reply(401, {message: `bad ${yandex.token}`});
    const error = await verifyConnection(config, yandex).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectionVerificationError);
    expect(error).toMatchObject({kind: 'authentication', profile: 'yandex'});
    expect(String(error)).not.toContain(yandex.token);
  });

  it('reports Confluence startup HTML as a server failure before the user probe', async () => {
    const platform = nock('https://conf.example.test')
      .get('/confluence/rest/api/settings/systemInfo')
      .reply(200, '<html><body><h1>Confluence had problems starting up</h1></body></html>', {'Content-Type': 'text/html'});
    const user = nock('https://conf.example.test')
      .get('/confluence/rest/api/user/current')
      .reply(200, {username: 'operator'});
    const error = await verifyConnection(config, confluence).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectionVerificationError);
    expect(error).toMatchObject({kind: 'server', profile: 'confluence'});
    expect(String(error)).toContain('unavailable or not fully started');
    expect(String(error)).not.toContain('<html');
    expect(platform.isDone()).toBe(true);
    expect(user.isDone()).toBe(false);
  });

  it.each([
    [new HttpRequestError('forbidden', 403), 'forbidden'],
    [new HttpRequestError('missing', 404), 'not-found'],
    [new HttpRequestError('limited', 429), 'rate-limit'],
    [new HttpRequestError('server', 503), 'server'],
    [new HttpRequestError('timeout', undefined, 'GET', '/', 'ETIMEDOUT'), 'timeout'],
    [new HttpRequestError('dns', undefined, 'GET', '/', 'ENOTFOUND'), 'dns'],
    [new HttpRequestError('tls', undefined, 'GET', '/', 'CERT_HAS_EXPIRED'), 'tls'],
    [new ConfluenceResponseError('service-unavailable', 'preflight', 'not started'), 'server'],
    [new ConfluenceResponseError('invalid-response', 'preflight', 'invalid'), 'unexpected'],
    [new Error('unknown'), 'unexpected'],
  ] as const)('classifies %s as %s', (error, expected) => {
    expect(classifyConnectionFailure(error)).toBe(expected);
  });
});
