import axios, {type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios';
import type {RequestRateLimiter} from './rate-limiter.js';

export interface RetryingHttpClientOptions {
  baseURL?: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  rateLimiter?: RequestRateLimiter;
}

export type RetryingRequestConfig = AxiosRequestConfig & {
  /** Unsafe methods are not retried by default because their outcome can be ambiguous. */
  retryMode?: 'safe' | 'always' | 'never';
};

export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly method?: string,
    public readonly url?: string,
    public readonly code?: string,
    public readonly attempts: number = 1,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

function retryAfterMs(response: AxiosResponse | undefined): number | undefined {
  const raw = response?.headers['retry-after'];
  if (raw === undefined) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(String(raw));
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isRetriable(error: AxiosError): boolean {
  if (!error.response) return error.code !== 'ERR_CANCELED';
  return error.response.status === 429 || error.response.status >= 500;
}

function stripControlCharacters(value: string): string {
  return [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
}

function textPayloadDetail(payload: string): string {
  const html = /<!doctype\s+html|<html\b|<head\b|<body\b|<title\b|<h1\b/iu.test(payload);
  if (!html) return stripControlCharacters(payload).replace(/\s+/g, ' ').trim().slice(0, 500);
  return 'provider returned an HTML error page';
}

function safeErrorMessage(error: AxiosError): string {
  const status = error.response?.status;
  const payload = error.response?.data;
  let detail = '';
  if (typeof payload === 'string') detail = textPayloadDetail(payload);
  else if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    detail = String(body.debug_message ?? body.message ?? body.error_code ?? '').slice(0, 500);
  }
  const guidance = status === 401
    ? 'authentication rejected; check token and auth type'
    : status === 403
      ? 'request forbidden; check object visibility, content restrictions, provider validation, security filters, and token permissions'
      : status === 404
        ? 'resource or API route not found; check URL, page ID, deployment, and API compatibility'
        : status === 409
          ? 'provider rejected the current revision or request state; ywtc will classify and reconcile the operation when supported'
          : status === 413
            ? 'payload too large for the destination; check Confluence attachment limits'
            : status === 429
              ? 'rate limited after bounded retries; lower configured RPS/concurrency or retry later'
              : (status ?? 0) >= 500
                ? 'provider service unavailable after bounded retries; retry after the service recovers'
                : ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '')
                  ? 'connection timed out; check provider health, URL, network/VPN, and timeout settings'
                  : ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error.code ?? '')
                    ? 'provider host could not be reached; check DNS, URL, proxy, VPN, and network access'
                    : [
                      'CERT_HAS_EXPIRED',
                      'DEPTH_ZERO_SELF_SIGNED_CERT',
                      'ERR_TLS_CERT_ALTNAME_INVALID',
                      'SELF_SIGNED_CERT_IN_CHAIN',
                      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
                    ].includes(error.code ?? '')
                      ? 'TLS verification failed; install the trusted CA through NODE_EXTRA_CA_CERTS'
                      : undefined;
  return [`HTTP request failed`, status ? `status=${status}` : undefined, guidance, detail || error.message]
    .filter(Boolean)
    .join(': ');
}

export class RetryingHttpClient {
  private readonly client: AxiosInstance;
  private readonly maxRetries: number;
  private readonly rateLimiter: RequestRateLimiter | undefined;

  constructor(options: RetryingHttpClientOptions) {
    this.client = axios.create({
      ...(options.baseURL ? {baseURL: options.baseURL} : {}),
      timeout: options.timeoutMs,
      ...(options.headers ? {headers: options.headers} : {}),
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    this.maxRetries = options.maxRetries ?? 4;
    this.rateLimiter = options.rateLimiter;
  }

  async request<T>(config: RetryingRequestConfig): Promise<AxiosResponse<T>> {
    const {retryMode = 'safe', ...axiosConfig} = config;
    const method = String(axiosConfig.method ?? 'GET').toUpperCase();
    const canRetry = retryMode === 'always'
      || (retryMode === 'safe' && ['GET', 'HEAD', 'OPTIONS'].includes(method));
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.rateLimiter?.acquire();
        return await this.client.request<T>(axiosConfig);
      } catch (caught) {
        const error = caught as AxiosError;
        if (!axios.isAxiosError(error)) throw caught;

        const backoff = Math.min(30_000, 500 * 2 ** attempt + Math.floor(Math.random() * 250));
        const headerDelay = retryAfterMs(error.response);
        const delay = error.response?.status === 429
          ? Math.max(1_000, headerDelay ?? backoff)
          : Math.min(60_000, headerDelay ?? backoff);
        if (error.response?.status === 429) this.rateLimiter?.pause(delay);

        if (!canRetry || attempt >= this.maxRetries || !isRetriable(error)) {
          throw new HttpRequestError(
            safeErrorMessage(error),
            error.response?.status,
            method,
            String(axiosConfig.url ?? ''),
            error.code,
            attempt + 1,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
