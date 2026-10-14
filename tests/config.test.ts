import {describe, expect, it} from 'vitest';
import {readConfig} from '../src/config.js';

describe('environment configuration', () => {
  it('parses authentication modes, URLs, timeout and concurrency', () => {
    const config = readConfig({
      YANDEX_WIKI_TOKEN: 'wiki',
      YANDEX_WIKI_AUTH_TYPE: 'iam',
      YANDEX_WIKI_ORG_ID: '42',
      YANDEX_WIKI_ORG_TYPE: 'cloud',
      YANDEX_WIKI_API_URL: 'https://api.wiki.yandex.net/v1/',
      YANDEX_WIKI_WEB_URL: 'https://wiki.yandex.ru/',
      CONFLUENCE_BASE_URL: 'https://conf.example.test/confluence/',
      CONFLUENCE_TOKEN: 'conf',
      HTTP_TIMEOUT_MS: '45000',
      MIGRATION_CONCURRENCY: '8',
      YANDEX_API_CONCURRENCY: '5',
      YANDEX_DOWNLOAD_CONCURRENCY: '3',
      YANDEX_API_RPS: '9',
      YANDEX_API_BURST: '11',
      CONFLUENCE_READ_CONCURRENCY: '6',
      CONFLUENCE_WRITE_CONCURRENCY: '2',
      CONFLUENCE_UPLOAD_CONCURRENCY: '3',
      CONFLUENCE_API_RPS: '7',
      CONFLUENCE_API_BURST: '12',
    });

    expect(config.yandex.authType).toBe('iam');
    expect(config.yandex.orgType).toBe('cloud');
    expect(config.confluence.baseUrl).toBe('https://conf.example.test/confluence');
    expect(config.timeoutMs).toBe(45_000);
    expect(config.concurrency).toBe(8);
    expect(config.networkLimits).toEqual({
      yandex: {apiConcurrency: 5, downloadConcurrency: 3, requestsPerSecond: 9, burst: 11},
      confluence: {readConcurrency: 6, writeConcurrency: 2, uploadConcurrency: 3, requestsPerSecond: 7, burst: 12},
    });
  });

  it('reports field names without echoing secret values', () => {
    expect(() => readConfig({})).toThrow(/YANDEX_WIKI_TOKEN/);
    try {
      readConfig({CONFLUENCE_TOKEN: 'do-not-print'});
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print');
    }
  });
});
