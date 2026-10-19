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
    [403, /request forbidden/],
    [404, /resource or API route not found/],
    [409, /provider rejected the current revision or request state/],
    [413, /payload too large/],
    [429, /rate limited after bounded retries/],
  ] as const)('adds corrective guidance for HTTP %s', async (status, message) => {
    nock('https://errors.example.test').get(`/status-${status}`).reply(status, {message: 'vendor detail'});
    const client = new RetryingHttpClient({baseURL: 'https://errors.example.test', timeoutMs: 5_000, maxRetries: 0});
    await expect(client.request({method: 'GET', url: `/status-${status}`})).rejects.toThrow(message);
  });

  it('sanitizes provider HTML error pages and explains server recovery', async () => {
    nock('https://errors.example.test').get('/startup').reply(
      503,
      '<html><head><title>Confluence unavailable</title></head><body><h1>Attachment storage check failed</h1><script>secret()</script></body></html>',
      {'Content-Type': 'text/html'},
    );
    const client = new RetryingHttpClient({baseURL: 'https://errors.example.test', timeoutMs: 5_000, maxRetries: 0});
    const error = await client.request({method: 'GET', url: '/startup'}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(String(error)).toContain('provider service unavailable after bounded retries');
    expect(String(error)).toContain('provider returned an HTML error page');
    expect(String(error)).not.toContain('<html');
    expect(String(error)).not.toContain('<script>');
  });

  it.each([
    ['ETIMEDOUT', /connection timed out/],
    ['ENOTFOUND', /provider host could not be reached/],
    ['CERT_HAS_EXPIRED', /TLS verification failed/],
  ] as const)('adds corrective guidance for transport error %s', async (code, message) => {
    const transportError = Object.assign(new Error('transport failed'), {code});
    nock('https://errors.example.test').get(`/transport-${code}`).replyWithError(transportError);
    const client = new RetryingHttpClient({baseURL: 'https://errors.example.test', timeoutMs: 5_000, maxRetries: 0});
    await expect(client.request({method: 'GET', url: `/transport-${code}`})).rejects.toThrow(message);
  });

  it('redacts every occurrence of configured secrets', () => {
    expect(redact('token=secret and secret again', ['secret'])).toBe('token=[REDACTED] and [REDACTED] again');
  });
});
