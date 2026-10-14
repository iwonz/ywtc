import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Transform, type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import pLimit, {type LimitFunction} from 'p-limit';
import type {AppConfig, NetworkLimits} from '../config.js';
import {RetryingHttpClient} from '../http.js';
import {TokenBucketRateLimiter} from '../rate-limiter.js';
import type {
  DownloadedFile,
  YandexAttachment,
  YandexGrid,
  YandexGridSummary,
  YandexPageDetails,
  YandexPageIdentity,
  YandexWikiApi,
} from '../types.js';

interface CursorPage<T> {
  results: T[];
  next_cursor?: string | null;
}

export class YandexWikiClient implements YandexWikiApi {
  private readonly authenticated: RetryingHttpClient;
  private readonly apiLimit: LimitFunction;
  private readonly downloadLimit: LimitFunction;

  constructor(
    config: AppConfig['yandex'],
    timeoutMs: number,
    limits: NetworkLimits['yandex'] = {
      apiConcurrency: 4,
      downloadConcurrency: 2,
      requestsPerSecond: 8,
      burst: 8,
    },
  ) {
    const authorization = config.authType === 'oauth' ? `OAuth ${config.token}` : `Bearer ${config.token}`;
    const orgHeader = config.orgType === 'yandex360' ? 'X-Org-Id' : 'X-Cloud-Org-Id';
    const rateLimiter = new TokenBucketRateLimiter(limits);
    this.apiLimit = pLimit(limits.apiConcurrency);
    this.downloadLimit = pLimit(limits.downloadConcurrency);
    this.authenticated = new RetryingHttpClient({
      baseURL: config.apiUrl,
      timeoutMs,
      rateLimiter,
      headers: {
        Authorization: authorization,
        [orgHeader]: config.orgId,
        Accept: 'application/json',
      },
    });
  }

  async getPageBySlug(slug: string): Promise<YandexPageDetails> {
    return this.apiLimit(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'GET',
        url: '/pages',
        params: {slug, fields: 'breadcrumbs,redirect,attributes,content'},
      });
      return response.data;
    });
  }

  async getPageById(id: number): Promise<YandexPageDetails> {
    return this.apiLimit(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'GET',
        url: `/pages/${id}`,
        params: {fields: 'breadcrumbs,redirect,attributes,content'},
      });
      return response.data;
    });
  }

  private async paginate<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.authenticated.request<CursorPage<T>>({
        method: 'GET',
        url,
        params: {...params, page_size: 100, ...(cursor ? {cursor} : {})},
      });
      results.push(...response.data.results);
      cursor = response.data.next_cursor || undefined;
    } while (cursor);
    return results;
  }

  getDescendants(id: number): Promise<YandexPageIdentity[]> {
    return this.apiLimit(() => this.paginate<YandexPageIdentity>(`/pages/${id}/descendants`, {
      actuality: 'actual',
      include_self: false,
    }));
  }

  getAttachments(pageId: number): Promise<YandexAttachment[]> {
    return this.apiLimit(() => this.paginate<YandexAttachment>(`/pages/${pageId}/attachments`, {order_by: 'name'}));
  }

  getPageGrids(pageId: number): Promise<YandexGridSummary[]> {
    return this.apiLimit(() => this.paginate<YandexGridSummary>(`/pages/${pageId}/grids`, {order_by: 'created_at'}));
  }

  async getGrid(id: string): Promise<YandexGrid> {
    return this.apiLimit(async () => {
      const response = await this.authenticated.request<YandexGrid>({
        method: 'GET',
        url: `/grids/${encodeURIComponent(id)}`,
        params: {fields: 'attributes'},
      });
      return response.data;
    });
  }

  async download(pageId: number, attachmentId: number, destination: string): Promise<DownloadedFile> {
    return this.downloadLimit(async () => {
      const response = await this.authenticated.request<Readable>({
        method: 'GET',
        url: `/pages/${pageId}/attachments/${attachmentId}/download`,
        responseType: 'stream',
      });

      await mkdir(path.dirname(destination), {recursive: true});
      const hash = createHash('sha256');
      let size = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          size += chunk.length;
          callback(null, chunk);
        },
      });
      await pipeline(response.data, meter, createWriteStream(destination, {mode: 0o600}));
      const contentType = response.headers['content-type'];
      return {
        path: destination,
        size,
        sha256: hash.digest('hex'),
        ...(typeof contentType === 'string' ? {mimeType: contentType} : {}),
      };
    });
  }
}
