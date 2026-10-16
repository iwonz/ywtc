import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import type {AppConfig, ConfluenceConnectionProfile, NetworkLimits} from '../src/config.js';
import {runCapabilityDoctor} from '../src/doctor.js';
import type {RemoteLocator} from '../src/locators.js';

const limits: NetworkLimits = {
  readConcurrency: 2,
  writeConcurrency: 1,
  downloadConcurrency: 1,
  uploadConcurrency: 1,
  requestsPerSecond: 20,
  burst: 20,
};

function profile(name: string, origin: string): ConfluenceConnectionProfile {
  return {
    name,
    type: 'confluence',
    deployment: 'data-center',
    baseUrl: `${origin}/confluence`,
    authType: 'pat',
    token: `${name}-token`,
    limits,
  };
}

afterEach(() => nock.cleanAll());

describe('doctor provider readiness barrier', () => {
  it('does not resolve either locator when destination preflight returns startup HTML', async () => {
    const sourceProfile = profile('source', 'https://source.example.test');
    const destinationProfile = profile('destination', 'https://destination.example.test');
    const config: AppConfig = {
      configFile: '/tmp/ywtc.config.yaml',
      timeoutMs: 5_000,
      concurrency: 2,
      profiles: {source: sourceProfile, destination: destinationProfile},
    };
    const source: RemoteLocator = {type: 'remote', profile: sourceProfile, value: '1'};
    const destination: RemoteLocator = {type: 'remote', profile: destinationProfile, value: '2'};
    const sourcePlatform = nock('https://source.example.test')
      .get('/confluence/rest/api/settings/systemInfo')
      .reply(200, {version: '11.0.0', futureCapability: {enabled: true}});
    const destinationPlatform = nock('https://destination.example.test')
      .get('/confluence/rest/api/settings/systemInfo')
      .reply(200, '<!doctype html><html><body><h1>Starting Confluence</h1></body></html>', {'Content-Type': 'text/html'});
    const sourcePage = nock('https://source.example.test')
      .get('/confluence/rest/api/content/1')
      .query(true)
      .reply(200, {id: '1', type: 'page', title: 'Source', space: {key: 'DOC'}});
    const destinationPage = nock('https://destination.example.test')
      .get('/confluence/rest/api/content/2')
      .query(true)
      .reply(200, {id: '2', type: 'page', title: 'Destination', space: {key: 'DOC'}});

    await expect(runCapabilityDoctor(config, source, destination, 'page', 'all', false))
      .rejects.toThrow(/unavailable or not fully started/);
    expect(sourcePlatform.isDone()).toBe(true);
    expect(destinationPlatform.isDone()).toBe(true);
    expect(sourcePage.isDone()).toBe(false);
    expect(destinationPage.isDone()).toBe(false);
  });
});
