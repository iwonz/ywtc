import type {Readable} from 'node:stream';
import FormData from 'form-data';
import pLimit, {type LimitFunction} from 'p-limit';
import type {AppConfig, NetworkLimits} from '../config.js';
import {HttpRequestError, RetryingHttpClient} from '../http.js';
import {TokenBucketRateLimiter} from '../rate-limiter.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluencePage, ConfluencePlatformInfo} from '../types.js';

interface ConfluenceList<T> {
  results: T[];
  start?: number;
  limit?: number;
  size?: number;
  _links?: {next?: string};
}

function firstResult<T>(payload: T | ConfluenceList<T>): T {
  if (payload && typeof payload === 'object' && 'results' in payload) {
    const first = (payload as ConfluenceList<T>).results[0];
    if (!first) throw new Error('Confluence returned an empty result');
    return first;
  }
  return payload as T;
}

type DataCenterConfig = Pick<AppConfig['confluence'], 'baseUrl' | 'token'> & Partial<Pick<AppConfig['confluence'], 'deployment' | 'authType'>>;

export class DataCenterConfluenceClient implements ConfluenceApi {
  private readonly http: RetryingHttpClient;
  private readonly readLimit: LimitFunction;
  private readonly writeLimit: LimitFunction;
  private readonly uploadLimit: LimitFunction;

  constructor(
    private readonly config: DataCenterConfig,
    timeoutMs: number,
    limits: NetworkLimits['confluence'] = {
      readConcurrency: 4,
      writeConcurrency: 2,
      uploadConcurrency: 2,
      requestsPerSecond: 8,
      burst: 10,
    },
  ) {
    const rateLimiter = new TokenBucketRateLimiter(limits);
    this.readLimit = pLimit(limits.readConcurrency);
    this.writeLimit = pLimit(limits.writeConcurrency);
    this.uploadLimit = pLimit(limits.uploadConcurrency);
    this.http = new RetryingHttpClient({
      baseURL: config.baseUrl,
      timeoutMs,
      rateLimiter,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
    });
  }

  async preflight(): Promise<ConfluencePlatformInfo> {
    return this.readLimit(async () => {
      let systemInfo: Record<string, unknown>;
      try {
        const response = await this.http.request<Record<string, unknown>>({
          method: 'GET',
          url: '/rest/api/settings/systemInfo',
        });
        systemInfo = response.data;
      } catch (error) {
        if (!(error instanceof HttpRequestError) || ![403, 404].includes(error.status ?? 0)) throw error;
        await this.http.request<ConfluenceList<ConfluencePage>>({
          method: 'GET',
          url: '/rest/api/content',
          params: {type: 'page', status: 'current', limit: 1, expand: 'space,version,body.storage'},
        });
        return {deployment: 'data-center', product: 'Confluence Data Center', api: '/rest/api'};
      }
      const version = typeof systemInfo.version === 'string'
        ? systemInfo.version
        : typeof systemInfo.versionNumber === 'string'
          ? systemInfo.versionNumber
          : undefined;
      if (version) {
        const [major = 0, minor = 0] = version.split('.').map(Number);
        if (Number.isFinite(major) && (major < 7 || (major === 7 && minor < 9))) {
          throw new Error(`Unsupported Confluence Data Center ${version}: ywtc requires 7.9+ with Personal Access Tokens.`);
        }
      }
      return {deployment: 'data-center', product: 'Confluence Data Center', ...(version ? {version} : {}), api: '/rest/api'};
    });
  }

  async getPage(id: string): Promise<ConfluencePage> {
    return this.readLimit(async () => {
      const response = await this.http.request<ConfluencePage>({
        method: 'GET',
        url: `/rest/api/content/${encodeURIComponent(id)}`,
        params: {expand: 'space,version,ancestors,body.storage,body.view,operations'},
      });
      return response.data;
    });
  }

  async findPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | undefined> {
    return this.readLimit(async () => {
      const response = await this.http.request<ConfluenceList<ConfluencePage>>({
        method: 'GET',
        url: '/rest/api/content',
        params: {type: 'page', status: 'current', spaceKey, title, expand: 'space,version', limit: 2},
      });
      return response.data.results[0];
    });
  }

  async resolveTarget(input: string): Promise<ConfluencePage> {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return this.getPage(trimmed);

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Confluence target must be a numeric page ID or an absolute page URL');
    }
    const base = new URL(this.config.baseUrl);
    if (url.origin !== base.origin) throw new Error(`Confluence target host must match ${base.origin}`);

    const queryId = url.searchParams.get('pageId');
    if (queryId && /^\d+$/.test(queryId)) return this.getPage(queryId);

    const pageIdMatch = url.pathname.match(/\/(?:pages|content)\/(\d+)(?:\/|$)/);
    if (pageIdMatch?.[1]) return this.getPage(pageIdMatch[1]);

    const displayMatch = url.pathname.match(/\/display\/([^/]+)\/([^/?#]+)/);
    if (displayMatch?.[1] && displayMatch[2]) {
      const spaceKey = decodeURIComponent(displayMatch[1]);
      const title = decodeURIComponent(displayMatch[2].replace(/\+/g, ' '));
      const page = await this.findPageByTitle(spaceKey, title);
      if (page) return this.getPage(page.id);
      throw new Error(`Confluence target page not found: ${spaceKey}/${title}`);
    }

    throw new Error('Could not extract a Confluence page ID or display URL from --target');
  }

  async createPage(input: {spaceKey: string; parentId: string; title: string; storage: string}): Promise<ConfluencePage> {
    return this.writeLimit(async () => {
      const response = await this.http.request<ConfluencePage>({
        method: 'POST',
        url: '/rest/api/content',
        headers: {'Content-Type': 'application/json'},
        data: {
          type: 'page',
          title: input.title,
          ancestors: [{id: input.parentId}],
          space: {key: input.spaceKey},
          body: {storage: {value: input.storage, representation: 'storage'}},
        },
      });
      return response.data;
    });
  }

  async updatePage(input: {pageId: string; title: string; storage: string}): Promise<ConfluencePage> {
    return this.writeLimit(async () => {
      const current = await this.getPage(input.pageId);
      if (!current.version?.number) throw new Error(`Confluence page ${input.pageId} has no version information`);
      const response = await this.http.request<ConfluencePage>({
        method: 'PUT',
        url: `/rest/api/content/${encodeURIComponent(input.pageId)}`,
        headers: {'Content-Type': 'application/json'},
        data: {
          id: input.pageId,
          type: 'page',
          title: input.title,
          version: {
            number: current.version.number + 1,
            minorEdit: true,
            message: 'Migrated from Yandex Wiki',
          },
          body: {storage: {value: input.storage, representation: 'storage'}},
        },
      });
      return response.data;
    });
  }

  async findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined> {
    return this.readLimit(async () => {
      const response = await this.http.request<ConfluenceList<ConfluenceAttachment>>({
        method: 'GET',
        url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
        params: {filename, limit: 2, expand: 'extensions,metadata'},
      });
      return response.data.results[0];
    });
  }

  async uploadAttachment(input: {
    pageId: string;
    filename: string;
    file: Readable;
    contentLength?: number;
    mimeType?: string;
    existingAttachmentId?: string;
  }): Promise<ConfluenceAttachment> {
    return this.uploadLimit(async () => {
      const form = new FormData();
      form.append('file', input.file, {
        filename: input.filename,
        ...(input.mimeType ? {contentType: input.mimeType} : {}),
        ...(input.contentLength !== undefined ? {knownLength: input.contentLength} : {}),
      });
      form.append('minorEdit', 'true');
      form.append('comment', 'Migrated from Yandex Wiki');
      const pageId = encodeURIComponent(input.pageId);
      const url = input.existingAttachmentId
        ? `/rest/api/content/${pageId}/child/attachment/${encodeURIComponent(input.existingAttachmentId)}/data`
        : `/rest/api/content/${pageId}/child/attachment`;
      const response = await this.http.request<ConfluenceAttachment | ConfluenceList<ConfluenceAttachment>>({
        method: 'POST',
        url,
        params: {minorEdit: true},
        headers: {
          ...form.getHeaders(),
          'X-Atlassian-Token': 'nocheck',
        },
        data: form,
        maxBodyLength: Number.POSITIVE_INFINITY,
        maxContentLength: Number.POSITIVE_INFINITY,
      });
      return firstResult(response.data);
    });
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    return this.readLimit(async () => {
      const results: ConfluenceAttachment[] = [];
      let start = 0;
      while (true) {
        const response = await this.http.request<ConfluenceList<ConfluenceAttachment>>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
          params: {start, limit: 100, expand: 'extensions,metadata'},
        });
        results.push(...response.data.results);
        const size = response.data.size ?? response.data.results.length;
        if (!response.data._links?.next && size < 100) break;
        if (size === 0) break;
        start += size;
      }
      return results;
    });
  }

  pageWebUrl(page: ConfluencePage): string {
    if (page._links?.webui) return new URL(page._links.webui, `${this.config.baseUrl}/`).toString();
    return `${this.config.baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(page.id)}`;
  }

  static isNotFound(error: unknown): boolean {
    return error instanceof HttpRequestError && error.status === 404;
  }
}

/** @deprecated Use DataCenterConfluenceClient or createConfluenceClient. */
export class ConfluenceClient extends DataCenterConfluenceClient {}
