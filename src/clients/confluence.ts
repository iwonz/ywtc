import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import FormData from 'form-data';
import {parseTrashEvidence} from '../confluence-trash.js';
import PQueue from 'p-queue';
import type {ConfluenceConnectionProfile, NetworkLimits} from '../config.js';
import {HttpRequestError, RetryingHttpClient} from '../http.js';
import {RequestRateLimiter} from '../rate-limiter.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluenceComment, ConfluencePage, ConfluenceSpace, ConfluencePlatformInfo, DownloadedFile} from '../types.js';
import {
  confluenceAttachmentSchema,
  confluenceUserSchema,
  dataCenterCommentSchema,
  type DataCenterCommentPayload,
  dataCenterPageSchema,
  dataCenterSpaceSchema,
  dataCenterSystemInfoSchema,
  normalizeConfluenceAttachment,
  normalizeDataCenterPage,
  parseConfluenceAttachmentResult,
  parseConfluenceList,
  parseConfluenceResponse,
} from './confluence-response.js';

function normalizeComment(comment: DataCenterCommentPayload): ConfluenceComment {
  const author = comment.history?.createdBy ?? comment.version?.by ?? {};
  const ancestors = comment.ancestors ?? [];
  const createdAt = comment.history?.createdDate ?? comment.version?.when;
  const parent = comment.extensions?.parentCommentId
    ?? [...ancestors].reverse().find((item) => item.type === 'comment')?.id;
  return {
    id: comment.id,
    ...(comment.type ? {type: comment.type} : {}),
    ...(comment.status ? {status: comment.status} : {}),
    ...(comment.title ? {title: comment.title} : {}),
    ...(parent ? {parentCommentId: parent} : {}),
    ...(createdAt ? {createdAt} : {}),
    ...(comment.extensions?.resolutionStatus ? {resolutionStatus: comment.extensions.resolutionStatus} : {}),
    ...(comment.extensions?.inlineProperties?.originalSelection ? {inlineContext: comment.extensions.inlineProperties.originalSelection} : {}),
    author: {
      ...(typeof author.userKey === 'string' ? {userKey: author.userKey} : {}),
      ...(typeof author.username === 'string' ? {username: author.username} : {}),
      ...(typeof author.displayName === 'string' ? {displayName: author.displayName} : {}),
      ...(typeof author.email === 'string' ? {email: author.email} : {}),
    },
    ...(comment.version ? {version: {number: comment.version.number}} : {}),
    ...(comment.body?.storage ? {body: {storage: {
      value: comment.body.storage.value,
      representation: comment.body.storage.representation,
    }}} : {}),
    ...(comment._links ? {_links: {
      ...(comment._links.webui ? {webui: comment._links.webui} : {}),
      ...(comment._links.self ? {self: comment._links.self} : {}),
    }} : {}),
  };
}

type DataCenterConfig = Pick<ConfluenceConnectionProfile, 'baseUrl' | 'token'> & Partial<Pick<ConfluenceConnectionProfile, 'deployment' | 'authType' | 'name'>>;
type QueueRunner = <T>(task: () => Promise<T>) => Promise<T>;

export class DataCenterConfluenceClient implements ConfluenceApi {
  async trashEvidence(id:string,status:'current'|'trashed'='current') {
    return this.readLimit(async()=>{const response=await this.http.request<unknown>({method:'GET',url:`/rest/api/content/${encodeURIComponent(id)}`,params:{status,expand:'version,childTypes.page,operations'}});return parseTrashEvidence(response.data,id);});
  }
  async trashPublishedLeaf(id:string,version:string):Promise<void> {
    const evidence=await this.trashEvidence(id);if(!evidence.allowed||evidence.version!==version)throw new Error('Trash preview is stale or the page is not a proved published leaf');
    await this.writeLimit(async()=>{await this.http.request({method:'DELETE',url:`/rest/api/content/${encodeURIComponent(id)}`,params:{status:'current'}});});
  }
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
      const response = await this.http.request<unknown>({
        method: 'GET',
        url: '/rest/api/user/current',
      });
      return parseConfluenceResponse(confluenceUserSchema, response.data, 'reading the current Data Center user');
    });
  }


  async preflight(): Promise<ConfluencePlatformInfo> {
    return this.readLimit(async () => {
      const probeContent = async (): Promise<void> => {
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: '/rest/api/content',
          params: {type: 'page', status: 'current', limit: 1, expand: 'space,version,body.storage'},
        });
        parseConfluenceList(dataCenterPageSchema, response.data, 'checking the Data Center content API');
      };
      let systemInfo: ReturnType<typeof dataCenterSystemInfoSchema.parse>;
      try {
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: '/rest/api/settings/systemInfo',
        });
        systemInfo = parseConfluenceResponse(dataCenterSystemInfoSchema, response.data, 'checking Data Center platform information');
      } catch (error) {
        if (!(error instanceof HttpRequestError) || ![403, 404].includes(error.status ?? 0)) throw error;
        await probeContent();
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
      } else {
        await probeContent();
      }
      return {deployment: 'data-center', product: 'Confluence Data Center', ...(version ? {version} : {}), api: '/rest/api'};
    });
  }

  async getSpace(key: string): Promise<ConfluenceSpace> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({method: 'GET', url: `/rest/api/space/${encodeURIComponent(key)}`, params: {expand: 'homepage'}});
      const space = parseConfluenceResponse(dataCenterSpaceSchema, response.data, 'reading Data Center source space');
      if (space.key !== key) throw new Error('Confluence source space key differs from the requested key');
      return {id: space.id, key: space.key, name: space.name, ...(space.homepage ? {homepageId: space.homepage.id} : {})};
    });
  }

  async getSpacePages(space: ConfluenceSpace, signal?: AbortSignal): Promise<ConfluencePage[]> {
    return this.readLimit(async () => {
      const results = new Map<string, ConfluencePage>();
      let start = 0;
      const seen = new Set<number>();
      for (;;) {
        if (signal?.aborted) throw signal.reason ?? new Error('Space discovery cancelled');
        if (seen.has(start)) throw new Error('Confluence space pagination repeated an offset');
        seen.add(start);
        const response = await this.http.request<unknown>({method: 'GET', url: `/rest/api/space/${encodeURIComponent(space.key)}/content/page`, ...(signal ? {signal} : {}), params: {start, limit: 100, depth: 'all', expand: 'space,version,ancestors,body.storage'}});
        const batch = parseConfluenceList(dataCenterPageSchema, response.data, 'listing Data Center source space pages');
        let added = 0;
        for (const item of batch.results) {
          if (item.space.key !== space.key || (item.space.id && item.space.id !== space.id)) throw new Error('Confluence page belongs to another source space');
          if (!results.has(item.id)) added += 1;
          results.set(item.id, normalizeDataCenterPage(item));
        }
        if (!batch._links?.next) break;
        if (added === 0) throw new Error('Confluence space pagination made no progress');
        const next = new URL(batch._links.next, this.config.baseUrl).searchParams.get('start');
        start = next === null ? start + batch.results.length : Number(next);
        if (!Number.isSafeInteger(start) || start < 0) throw new Error('Confluence space pagination returned an invalid offset');
      }
      return [...results.values()];
    });
  }

  async getPage(id: string): Promise<ConfluencePage> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET',
        url: `/rest/api/content/${encodeURIComponent(id)}`,
        params: {expand: 'space,version,ancestors,body.storage,operations'},
      });
      return normalizeDataCenterPage(parseConfluenceResponse(dataCenterPageSchema, response.data, `reading Data Center page ${id}`));
    });
  }

  async findPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | undefined> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET',
        url: '/rest/api/content',
        params: {type: 'page', status: 'current', spaceKey, title, expand: 'space,version,ancestors', limit: 2},
      });
      const page = parseConfluenceList(dataCenterPageSchema, response.data, `finding Data Center page ${spaceKey}/${title}`).results[0];
      return page ? normalizeDataCenterPage(page) : undefined;
    });
  }

  async findChildPage(parentId: string, title: string): Promise<ConfluencePage | undefined> {
    return this.readLimit(async () => {
      const limit = 100;
      let start = 0;
      for (;;) {
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(parentId)}/child/page`,
          params: {start, limit, expand: 'space,version,ancestors'},
        });
        const page = parseConfluenceList(dataCenterPageSchema, response.data, `listing children of Data Center page ${parentId}`);
        const match = page.results.find((candidate) => candidate.title === title);
        if (match) return normalizeDataCenterPage(match);
        const count = page.results.length;
        if (count === 0 || (!page._links?.next && count < limit)) return undefined;
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
      const response = await this.http.request<unknown>({
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
      return normalizeDataCenterPage(parseConfluenceResponse(dataCenterPageSchema, response.data, `creating Data Center page "${input.title}"`));
    });
  }

  async updatePage(input: {pageId: string; title: string; storage: string; parentId?: string; version?: number}): Promise<ConfluencePage> {
    return this.writeLimit(async () => {
      const current = input.version ? undefined : await this.getPage(input.pageId);
      const version = input.version ?? current?.version?.number;
      if (!version) throw new Error(`Confluence page ${input.pageId} has no version information`);
      const response = await this.http.request<unknown>({
        method: 'PUT',
        url: `/rest/api/content/${encodeURIComponent(input.pageId)}`,
        headers: {'Content-Type': 'application/json'},
        data: {
          id: input.pageId,
          type: 'page',
          title: input.title,
          version: {
            number: version + 1,
            minorEdit: true,
            message: 'Transferred by ywtc',
          },
          ...(input.parentId ? {ancestors: [{id: input.parentId}]} : {}),
          body: {storage: {value: input.storage, representation: 'storage'}},
        },
      });
      return normalizeDataCenterPage(parseConfluenceResponse(dataCenterPageSchema, response.data, `updating Data Center page ${input.pageId}`));
    });
  }

  async findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET',
        url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
        params: {filename, limit: 2, expand: 'extensions,metadata'},
      });
      const attachment = parseConfluenceList(confluenceAttachmentSchema, response.data, `finding attachment on Data Center page ${pageId}`).results[0];
      return attachment ? normalizeConfluenceAttachment(attachment) : undefined;
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
      const response = await this.http.request<unknown>({
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
      return normalizeConfluenceAttachment(parseConfluenceAttachmentResult(response.data, `uploading attachment to Data Center page ${input.pageId}`));
    });
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    return this.readLimit(async () => {
      const results: ConfluenceAttachment[] = [];
      let start = 0;
      while (true) {
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
          params: {start, limit: 100, expand: 'extensions,metadata'},
        });
        const page = parseConfluenceList(confluenceAttachmentSchema, response.data, `listing attachments on Data Center page ${pageId}`);
        results.push(...page.results.map(normalizeConfluenceAttachment));
        const size = page.size ?? page.results.length;
        if (!page._links?.next && size < 100) break;
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
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(pageId)}/descendant/page`,
          params: {start, limit: 100, expand: 'space,version,ancestors,body.storage'},
        });
        const page = parseConfluenceList(dataCenterPageSchema, response.data, `listing descendants of Data Center page ${pageId}`);
        results.push(...page.results.map(normalizeDataCenterPage));
        const size = page.size ?? page.results.length;
        if (!page._links?.next || size === 0) break;
        start += size;
      }
      return results;
    });
  }

  async getPageComments(pageId: string): Promise<ConfluenceComment[]> {
    return this.readLimit(async () => {
      const results: ConfluenceComment[] = [];
      let start = 0;
      while (true) {
        const response = await this.http.request<unknown>({
          method: 'GET',
          url: `/rest/api/content/${encodeURIComponent(pageId)}/child/comment`,
          params: {start, limit: 100, depth: 'all', expand: 'body.storage,version,history,ancestors,extensions'},
        });
        const page = parseConfluenceList(dataCenterCommentSchema, response.data, `listing comments on Data Center page ${pageId}`);
        results.push(...page.results.map(normalizeComment));
        const size = page.size ?? page.results.length;
        if (!page._links?.next || size === 0) break;
        start += size;
      }
      return results;
    });
  }

  async getComment(commentId: string): Promise<ConfluenceComment> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET', url: `/rest/api/content/${encodeURIComponent(commentId)}`,
        params: {expand: 'body.storage,version,history,ancestors,extensions'},
      });
      return normalizeComment(parseConfluenceResponse(dataCenterCommentSchema, response.data, `reading Data Center comment ${commentId}`));
    });
  }

  async createComment(input: {pageId: string; storage: string}): Promise<ConfluenceComment> {
    return this.writeLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'POST', url: '/rest/api/content', headers: {'Content-Type': 'application/json'},
        data: {
          type: 'comment',
          container: {id: input.pageId, type: 'page'},
          body: {storage: {value: input.storage, representation: 'storage'}},
        },
        retryMode: 'never',
      });
      return normalizeComment(parseConfluenceResponse(dataCenterCommentSchema, response.data, `creating a comment on Data Center page ${input.pageId}`));
    });
  }

  async updateComment(input: {commentId: string; storage: string; version?: number}): Promise<ConfluenceComment> {
    return this.writeLimit(async () => {
      const current = input.version ? undefined : await this.getComment(input.commentId);
      const version = input.version ?? current?.version?.number;
      if (!version) throw new Error(`Confluence comment ${input.commentId} has no version information`);
      const response = await this.http.request<unknown>({
        method: 'PUT', url: `/rest/api/content/${encodeURIComponent(input.commentId)}`,
        headers: {'Content-Type': 'application/json'},
        data: {
          id: input.commentId,
          type: 'comment',
          version: {number: version + 1, minorEdit: true, message: 'Comment archive updated by ywtc'},
          body: {storage: {value: input.storage, representation: 'storage'}},
        },
        retryMode: 'never',
      });
      return normalizeComment(parseConfluenceResponse(dataCenterCommentSchema, response.data, `updating Data Center comment ${input.commentId}`));
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
