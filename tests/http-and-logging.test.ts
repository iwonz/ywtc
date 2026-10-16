import nock from 'nock';
import {afterEach, describe, expect, it} from 'vitest';
import {HttpRequestError, RetryingHttpClient} from '../src/http.js';
import {redact} from '../src/logger.js';

afterEach(() => nock.cleanAll());

describe('HTTP retry and log safety', () => {
  it('retries transient safe requests', async () => {
    const scope = nock('https://retry.example.test')
      .get('/resource')
      .reply(500, {message: 'temporary'})
      .get('/resource')
      .reply(200, {ok: true});
    const client = new RetryingHttpClient({baseURL: 'https://retry.example.test', timeoutMs: 5_000, maxRetries: 1});

    const response = await client.request<{ok: boolean}>({method: 'GET', url: '/resource'});
    expect(response.data.ok).toBe(true);
    expect(scope.isDone()).toBe(true);
  });

  it('does not automatically retry non-idempotent posts', async () => {
    const scope = nock('https://retry.example.test')
      .post('/resource')
      .reply(500, {message: 'ambiguous'});
    const client = new RetryingHttpClient({baseURL: 'https://retry.example.test', timeoutMs: 5_000, maxRetries: 4});

    await expect(client.request({method: 'POST', url: '/resource'})).rejects.toBeInstanceOf(HttpRequestError);
    expect(scope.isDone()).toBe(true);
  });

  it.each([
    [401, /authentication rejected/],
    [403, /permission denied/],
    [404, /resource or API route not found/],
    [409, /provider rejected the current revision or request state/],
    [413, /payload too large/],
    [429, /rate limited after bounded retries/],
  ] as const)('adds corrective guidance for HTTP %s', async (status, message) => {
    nock('https://errors.example.test').get(`/status-${status}`).reply(status, {message: 'vendor detail'});
    const client = new RetryingHttpClient({baseURL: 'https://errors.example.test', timeoutMs: 5_000, maxRetries: 0});
    await expect(client.request({method: 'GET', url: `/status-${status}`})).rejects.toThrow(message);
  });

  it('redacts every occurrence of configured secrets', () => {
    expect(redact('token=secret and secret again', ['secret'])).toBe('token=[REDACTED] and [REDACTED] again');
  });
});
