import type {Readable} from 'node:stream';
import FormData from 'form-data';
import pLimit, {type LimitFunction} from 'p-limit';
import type {AppConfig, NetworkLimits} from '../config.js';
import {RetryingHttpClient} from '../http.js';
import {TokenBucketRateLimiter} from '../rate-limiter.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluencePage, ConfluencePlatformInfo} from '../types.js';

interface CloudList<T> {
  results: T[];
  _links?: {next?: string};
}

interface CloudPage {
  id: string;
  status?: string;
  title: string;
  spaceId: string;
  parentId?: string;
  version?: {number: number};
  body?: {
    storage?: {value: string; representation: string};
  };
  operations?: Array<{operation: string; targetType: string}>;
  _links?: {webui?: string; base?: string; self?: string};
}

interface CloudSpace {
  id: string;
  key: string;
  name?: string;
}

function cloudRoot(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/\/wiki$/, '')}/wiki`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function firstAttachment(payload: ConfluenceAttachment | CloudList<ConfluenceAttachment>): ConfluenceAttachment {
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const result = payload.results[0];
    if (!result) throw new Error('Confluence Cloud returned an empty attachment result');
    return result;
  }
  return payload as ConfluenceAttachment;
}

export class CloudConfluenceClient implements ConfluenceApi {
  private readonly baseUrl: string;
  private readonly http: RetryingHttpClient;
  private readonly readLimit: LimitFunction;
  private readonly writeLimit: LimitFunction;
  private readonly uploadLimit: LimitFunction;
  private readonly spacesByKey = new Map<string, CloudSpace>();
  private readonly spacesById = new Map<string, CloudSpace>();

  constructor(
    config: AppConfig['confluence'],
    timeoutMs: number,
    limits: NetworkLimits['confluence'],
  ) {
    if (!config.email) throw new Error('CONFLUENCE_EMAIL is required for Confluence Cloud');
    this.baseUrl = cloudRoot(config.baseUrl);
    const rateLimiter = new TokenBucketRateLimiter(limits);
    this.readLimit = pLimit(limits.readConcurrency);
    this.writeLimit = pLimit(limits.writeConcurrency);
    this.uploadLimit = pLimit(limits.uploadConcurrency);
    this.http = new RetryingHttpClient({
      baseURL: this.baseUrl,
      timeoutMs,
      rateLimiter,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });
  }

  async preflight(): Promise<ConfluencePlatformInfo> {
    await this.readLimit(async () => {
      await this.http.request<CloudList<CloudSpace>>({method: 'GET', url: '/api/v2/spaces', params: {limit: 1}});
    });
    return {deployment: 'cloud', product: 'Confluence Cloud', api: 'REST v2 pages/spaces + REST v1 attachments'};
  }

  private rememberSpace(space: CloudSpace): CloudSpace {
    this.spacesById.set(space.id, space);
    this.spacesByKey.set(space.key, space);
    return space;
  }

  private async getSpaceById(id: string): Promise<CloudSpace> {
    const cached = this.spacesById.get(id);
    if (cached) return cached;
    return this.readLimit(async () => {
      const response = await this.http.request<CloudSpace>({method: 'GET', url: `/api/v2/spaces/${encodeURIComponent(id)}`});
      return this.rememberSpace(response.data);
    });
  }

  private async getSpaceByKey(key: string): Promise<CloudSpace> {
    const cached = this.spacesByKey.get(key);
    if (cached) return cached;
    return this.readLimit(async () => {
      const response = await this.http.request<CloudList<CloudSpace>>({
        method: 'GET', url: '/api/v2/spaces', params: {keys: key, limit: 2},
      });
      const space = response.data.results[0];
      if (!space) throw new Error(`Confluence Cloud space not found: ${key}`);
      return this.rememberSpace(space);
    });
  }

  private async normalizePage(page: CloudPage): Promise<ConfluencePage> {
    if (!page.id || !page.title || !page.spaceId) throw new Error('Confluence Cloud page response is missing id, title, or spaceId');
    const space = await this.getSpaceById(page.spaceId);
    return {
      id: page.id,
      type: 'page',
      ...(page.status ? {status: page.status} : {}),
      title: page.title,
      space: {id: space.id, key: space.key, ...(space.name ? {name: space.name} : {})},
      ...(page.parentId ? {ancestors: [{id: page.parentId}]} : {}),
      ...(page.version ? {version: page.version} : {}),
      ...(page.body ? {body: page.body} : {}),
      ...(page.operations ? {operations: page.operations} : {}),
      ...(page._links ? {_links: page._links} : {}),
    };
  }

  async getPage(id: string): Promise<ConfluencePage> {
    const page = await this.readLimit(async () => {
      const response = await this.http.request<CloudPage>({
        method: 'GET', url: `/api/v2/pages/${encodeURIComponent(id)}`,
        params: {'body-format': 'storage', 'include-operations': true},
      });
      return response.data;
    });
    return this.normalizePage(page);
  }

  async findPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | undefined> {
    const space = await this.getSpaceByKey(spaceKey);
    const page = await this.readLimit(async () => {
      const response = await this.http.request<CloudList<CloudPage>>({
        method: 'GET', url: '/api/v2/pages', params: {'space-id': space.id, title, status: 'current', limit: 2},
      });
      return response.data.results[0];
    });
    return page ? this.normalizePage(page) : undefined;
  }

  async resolveTarget(input: string): Promise<ConfluencePage> {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return this.getPage(trimmed);
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Confluence Cloud target must be a numeric page ID or an absolute page URL');
    }
    const base = new URL(this.baseUrl);
    if (url.origin !== base.origin) throw new Error(`Confluence target host must match ${base.origin}`);
    const queryId = url.searchParams.get('pageId');
    if (queryId && /^\d+$/.test(queryId)) return this.getPage(queryId);
    const match = url.pathname.match(/\/(?:pages|content)\/(\d+)(?:\/|$)/);
    if (match?.[1]) return this.getPage(match[1]);
    throw new Error('Could not extract a Confluence Cloud page ID from --target');
  }

  async createPage(input: {spaceKey: string; parentId: string; title: string; storage: string}): Promise<ConfluencePage> {
    const space = await this.getSpaceByKey(input.spaceKey);
    const response = await this.writeLimit(() => this.http.request<CloudPage>({
      method: 'POST', url: '/api/v2/pages', headers: {'Content-Type': 'application/json'},
      data: {
        spaceId: space.id, status: 'current', title: input.title, parentId: input.parentId,
        body: {representation: 'storage', value: input.storage},
      },
    }));
    return this.normalizePage(response.data);
  }

  async updatePage(input: {pageId: string; title: string; storage: string}): Promise<ConfluencePage> {
    const current = await this.getPage(input.pageId);
    const versionNumber = current.version?.number;
    if (!versionNumber) throw new Error(`Confluence Cloud page ${input.pageId} has no version information`);
    const response = await this.writeLimit(() => this.http.request<CloudPage>({
      method: 'PUT', url: `/api/v2/pages/${encodeURIComponent(input.pageId)}`, headers: {'Content-Type': 'application/json'},
      data: {
        id: input.pageId, status: 'current', title: input.title,
        body: {representation: 'storage', value: input.storage},
        version: {number: versionNumber + 1, message: 'Migrated from Yandex Wiki'},
      },
    }));
    return this.normalizePage(response.data);
  }

  async findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined> {
    const response = await this.readLimit(() => this.http.request<CloudList<ConfluenceAttachment>>({
      method: 'GET', url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
      params: {filename, limit: 2, expand: 'extensions,metadata'},
    }));
    return response.data.results[0];
  }

  async uploadAttachment(input: {
    pageId: string; filename: string; file: Readable; contentLength?: number; mimeType?: string; existingAttachmentId?: string;
  }): Promise<ConfluenceAttachment> {
    return this.uploadLimit(async () => {
      const form = new FormData();
      form.append('file', input.file, {
        filename: input.filename,
        ...(input.mimeType ? {contentType: input.mimeType} : {}),
        ...(input.contentLength !== undefined ? {knownLength: input.contentLength} : {}),
      });
      form.append('minorEdit', 'true');
      const pageId = encodeURIComponent(input.pageId);
      const url = input.existingAttachmentId
        ? `/rest/api/content/${pageId}/child/attachment/${encodeURIComponent(input.existingAttachmentId)}/data`
        : `/rest/api/content/${pageId}/child/attachment`;
      const response = await this.http.request<ConfluenceAttachment | CloudList<ConfluenceAttachment>>({
        method: 'POST', url, headers: {...form.getHeaders(), 'X-Atlassian-Token': 'nocheck'}, data: form,
        maxBodyLength: Number.POSITIVE_INFINITY, maxContentLength: Number.POSITIVE_INFINITY,
      });
      return firstAttachment(response.data);
    });
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    const results: ConfluenceAttachment[] = [];
    let start = 0;
    while (true) {
      const response = await this.readLimit(() => this.http.request<CloudList<ConfluenceAttachment> & {size?: number}>({
        method: 'GET', url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
        params: {start, limit: 100, expand: 'extensions,metadata'},
      }));
      results.push(...response.data.results);
      const size = response.data.size ?? response.data.results.length;
      if (!response.data._links?.next || size === 0) break;
      start += size;
    }
    return results;
  }

  pageWebUrl(page: ConfluencePage): string {
    if (page._links?.webui) return new URL(page._links.webui, `${this.baseUrl}/`).toString();
    return `${this.baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(page.id)}`;
  }
}
