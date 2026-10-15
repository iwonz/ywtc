import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import FormData from 'form-data';
import PQueue from 'p-queue';
import type {ConfluenceConnectionProfile, NetworkLimits} from '../config.js';
import {HttpRequestError, RetryingHttpClient} from '../http.js';
import {RequestRateLimiter} from '../rate-limiter.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluencePage, ConfluencePlatformInfo, DownloadedFile} from '../types.js';

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

type DataCenterConfig = Pick<ConfluenceConnectionProfile, 'baseUrl' | 'token'> & Partial<Pick<ConfluenceConnectionProfile, 'deployment' | 'authType' | 'name'>>;
type QueueRunner = <T>(task: () => Promise<T>) => Promise<T>;

export class DataCenterConfluenceClient implements ConfluenceApi {
  private readonly http: RetryingHttpClient;
  private readonly readLimit: QueueRunner;
  private readonly writeLimit: QueueRunner;
  private readonly uploadLimit: QueueRunner;

  constructor(
    private readonly config: DataCenterConfig,
    timeoutMs: number,
    limits: NetworkLimits = {
      readConcurrency: 4,
      writeConcurrency: 2,
      downloadConcurrency: 2,
      uploadConcurrency: 2,
      requestsPerSecond: 8,
      burst: 10,
    },
  ) {
    const rateLimiter = new RequestRateLimiter(limits);
    const readQueue = new PQueue({concurrency: limits.readConcurrency});
    const writeQueue = new PQueue({concurrency: limits.writeConcurrency});
    const uploadQueue = new PQueue({concurrency: limits.uploadConcurrency});
    this.readLimit = <T>(task: () => Promise<T>) => readQueue.add(task) as Promise<T>;
    this.writeLimit = <T>(task: () => Promise<T>) => writeQueue.add(task) as Promise<T>;
    this.uploadLimit = <T>(task: () => Promise<T>) => uploadQueue.add(task) as Promise<T>;
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

  async getCurrentUser(): Promise<Record<string, unknown>> {
    return this.readLimit(async () => {
      const response = await this.http.request<Record<string, unknown>>({
        method: 'GET',
        url: '/rest/api/user/current',
      });
      return response.data;
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
        params: {type: 'page', status: 'current', spaceKey, title, expand: 'space,version,ancestors', limit: 2},
      });
      return response.data.results[0];
    });
  }

  async findChildPage(parentId: string, title: string): Promise<ConfluencePage | undefined> {
    return this.readLimit(async () => {
      const limit = 100;
      let start = 0;
      for (;;) {
        const response = await this.http.request<ConfluenceList<ConfluencePage>>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(parentId)}/child/page`,
          params: {start, limit, expand: 'space,version,ancestors'},
        });
        const match = response.data.results.find((page) => page.title === title);
        if (match) return match;
        const count = response.data.results.length;
        if (count === 0 || (!response.data._links?.next && count < limit)) return undefined;
        start += count;
      }
    });
  }

  async resolveTarget(input: string): Promise<ConfluencePage> {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return this.getPage(trimmed);

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Confluence page locator must be a numeric page ID or an absolute page URL');
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

    throw new Error('Could not extract a Confluence page ID or display URL from --destination/--source');
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
            message: 'Transferred by ywtc',
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
      form.append('comment', 'Transferred by ywtc');
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

  async getDescendants(pageId: string): Promise<ConfluencePage[]> {
    return this.readLimit(async () => {
      const results: ConfluencePage[] = [];
      let start = 0;
      while (true) {
        const response = await this.http.request<ConfluenceList<ConfluencePage>>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(pageId)}/descendant/page`,
          params: {start, limit: 100, expand: 'space,version,ancestors,body.storage,body.view'},
        });
        results.push(...response.data.results);
        const size = response.data.size ?? response.data.results.length;
        if (!response.data._links?.next || size === 0) break;
        start += size;
      }
      return results;
    });
  }

  async downloadAttachment(pageId: string, attachment: ConfluenceAttachment, destination: string): Promise<DownloadedFile> {
    return this.readLimit(async () => {
      const link = attachment._links?.download ?? `/download/attachments/${encodeURIComponent(pageId)}/${encodeURIComponent(attachment.title)}`;
      const url = /^https?:\/\//i.test(link)
        ? link
        : link.startsWith('/download/') ? `${this.config.baseUrl}${link}` : new URL(link, `${this.config.baseUrl}/`).toString();
      const response = await this.http.request<Readable>({method: 'GET', url, responseType: 'stream'});
      await mkdir(path.dirname(destination), {recursive: true});
      const hash = createHash('sha256');
      let size = 0;
      const meter = new Transform({transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        size += chunk.length;
        callback(null, chunk);
      }});
      await pipeline(response.data, meter, createWriteStream(destination, {mode: 0o600}));
      const contentType = response.headers['content-type'];
      return {path: destination, size, sha256: hash.digest('hex'), ...(typeof contentType === 'string' ? {mimeType: contentType} : {})};
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
