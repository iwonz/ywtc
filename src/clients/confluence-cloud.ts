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
import {RetryingHttpClient} from '../http.js';
import {RequestRateLimiter} from '../rate-limiter.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluenceComment, ConfluencePage, ConfluenceSpace, ConfluencePlatformInfo, DownloadedFile} from '../types.js';
import {
  cloudCommentSchema,
  type CloudCommentPayload,
  cloudPageSchema,
  type CloudPagePayload,
  cloudSpaceSchema,
  type CloudSpacePayload,
  cloudUserSchema,
  type CloudUserPayload,
  confluenceAttachmentSchema,
  confluenceUserSchema,
  normalizeConfluenceAttachment,
  parseConfluenceAttachmentResult,
  parseConfluenceList,
  parseConfluenceResponse,
} from './confluence-response.js';

function cloudRoot(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/\/wiki$/, '')}/wiki`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export class CloudConfluenceClient implements ConfluenceApi {
  async trashEvidence(id:string,status:'current'|'trashed'='current') {
    return this.readLimit(async()=>{const response=await this.http.request<unknown>({method:'GET',url:`/rest/api/content/${encodeURIComponent(id)}`,params:{status,expand:'version,childTypes.page,operations'}});return parseTrashEvidence(response.data,id);});
  }
  async trashPublishedLeaf(id:string,version:string):Promise<void> {
    const evidence=await this.trashEvidence(id);if(!evidence.allowed||evidence.version!==version)throw new Error('Trash preview is stale or the page is not a proved published leaf');
    await this.writeLimit(async()=>{await this.http.request({method:'DELETE',url:`/api/v2/pages/${encodeURIComponent(id)}`,params:{purge:false,draft:false}});});
  }
  private readonly baseUrl: string;
  private readonly http: RetryingHttpClient;
  private readonly readLimit: <T>(task: () => Promise<T>) => Promise<T>;
  private readonly writeLimit: <T>(task: () => Promise<T>) => Promise<T>;
  private readonly uploadLimit: <T>(task: () => Promise<T>) => Promise<T>;
  private readonly spacesByKey = new Map<string, CloudSpacePayload>();
  private readonly spacesById = new Map<string, CloudSpacePayload>();
  private readonly usersById = new Map<string, CloudUserPayload>();

  constructor(
    config: ConfluenceConnectionProfile,
    timeoutMs: number,
    limits: NetworkLimits,
  ) {
    if (!config.email) throw new Error('CONFLUENCE_EMAIL is required for Confluence Cloud');
    this.baseUrl = cloudRoot(config.baseUrl);
    const rateLimiter = new RequestRateLimiter(limits);
    const readQueue = new PQueue({concurrency: limits.readConcurrency});
    const writeQueue = new PQueue({concurrency: limits.writeConcurrency});
    const uploadQueue = new PQueue({concurrency: limits.uploadConcurrency});
    this.readLimit = <T>(task: () => Promise<T>) => readQueue.add(task) as Promise<T>;
    this.writeLimit = <T>(task: () => Promise<T>) => writeQueue.add(task) as Promise<T>;
    this.uploadLimit = <T>(task: () => Promise<T>) => uploadQueue.add(task) as Promise<T>;
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

  async getCurrentUser(): Promise<Record<string, unknown>> {
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({method: 'GET', url: '/rest/api/user/current'});
      return parseConfluenceResponse(confluenceUserSchema, response.data, 'reading the current Confluence Cloud user');
    });
  }


  async preflight(): Promise<ConfluencePlatformInfo> {
    await this.readLimit(async () => {
      const response = await this.http.request<unknown>({method: 'GET', url: '/api/v2/spaces', params: {limit: 1}});
      parseConfluenceList(cloudSpaceSchema, response.data, 'checking the Confluence Cloud spaces API');
    });
    return {deployment: 'cloud', product: 'Confluence Cloud', api: 'REST v2 pages/spaces + REST v1 attachments'};
  }

  private rememberSpace(space: CloudSpacePayload): CloudSpacePayload {
    this.spacesById.set(space.id, space);
    this.spacesByKey.set(space.key, space);
    return space;
  }

  private async getSpaceById(id: string): Promise<CloudSpacePayload> {
    const cached = this.spacesById.get(id);
    if (cached) return cached;
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({method: 'GET', url: `/api/v2/spaces/${encodeURIComponent(id)}`});
      return this.rememberSpace(parseConfluenceResponse(cloudSpaceSchema, response.data, `reading Confluence Cloud space ${id}`));
    });
  }

  private async getSpaceByKey(key: string): Promise<CloudSpacePayload> {
    const cached = this.spacesByKey.get(key);
    if (cached) return cached;
    return this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET', url: '/api/v2/spaces', params: {keys: key, limit: 2},
      });
      const space = parseConfluenceList(cloudSpaceSchema, response.data, `finding Confluence Cloud space ${key}`).results[0];
      if (!space) throw new Error(`Confluence Cloud space not found: ${key}`);
      return this.rememberSpace(space);
    });
  }

  private async normalizePage(page: CloudPagePayload): Promise<ConfluencePage> {
    const space = await this.getSpaceById(page.spaceId);
    return {
      id: page.id,
      type: 'page',
      ...(page.status ? {status: page.status} : {}),
      title: page.title,
      space: {id: space.id, key: space.key, ...(space.name ? {name: space.name} : {})},
      ...(page.parentId ? {ancestors: [{id: page.parentId}]} : {}),
      ...(page.version ? {version: page.version} : {}),
      ...(page.body?.storage ? {body: {storage: {
        value: page.body.storage.value,
        representation: page.body.storage.representation,
      }}} : {}),
      ...(page.operations ? {operations: page.operations} : {}),
      ...(page._links ? {_links: {
        ...(page._links.webui ? {webui: page._links.webui} : {}),
        ...(page._links.base ? {base: page._links.base} : {}),
        ...(page._links.self ? {self: page._links.self} : {}),
      }} : {}),
    };
  }

  async getSpace(key: string): Promise<ConfluenceSpace> {
    const space = await this.getSpaceByKey(key);
    if (space.key !== key) throw new Error('Confluence source space key differs from the requested key');
    return {id: space.id, key: space.key, name: space.name ?? space.key, ...(space.homepageId ? {homepageId: space.homepageId} : {})};
  }

  async getSpacePages(space: ConfluenceSpace, signal?: AbortSignal): Promise<ConfluencePage[]> {
    const results = new Map<string, ConfluencePage>();
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      if (signal?.aborted) throw signal.reason ?? new Error('Space discovery cancelled');
      if (cursor) {
        if (seen.has(cursor)) throw new Error('Confluence Cloud space pagination cursor repeated');
        seen.add(cursor);
      }
      const response = await this.readLimit(() => this.http.request<unknown>({method: 'GET', url: `/api/v2/spaces/${encodeURIComponent(space.id)}/pages`, ...(signal ? {signal} : {}), params: {'body-format': 'storage', limit: 100, ...(cursor ? {cursor} : {})}}));
      const batch = parseConfluenceList(cloudPageSchema, response.data, 'listing Confluence Cloud source space pages');
      let added = 0;
      for (const item of batch.results) {
        if (item.spaceId !== space.id) throw new Error('Confluence page belongs to another source space');
        if (!results.has(item.id)) added += 1;
        results.set(item.id, await this.normalizePage(item));
      }
      const next = batch._links?.next;
      cursor = next ? new URL(next, `${this.baseUrl}/`).searchParams.get('cursor') ?? undefined : undefined;
      if (next && (!cursor || added === 0)) throw new Error('Confluence Cloud space pagination made no progress');
    } while (cursor);
    return [...results.values()];
  }

  async getPage(id: string): Promise<ConfluencePage> {
    const page = await this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET', url: `/api/v2/pages/${encodeURIComponent(id)}`,
        params: {'body-format': 'storage', 'include-operations': true},
      });
      return parseConfluenceResponse(cloudPageSchema, response.data, `reading Confluence Cloud page ${id}`);
    });
    return this.normalizePage(page);
  }

  async findPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | undefined> {
    const space = await this.getSpaceByKey(spaceKey);
    const page = await this.readLimit(async () => {
      const response = await this.http.request<unknown>({
        method: 'GET', url: '/api/v2/pages', params: {'space-id': space.id, title, status: 'current', limit: 2},
      });
      return parseConfluenceList(cloudPageSchema, response.data, `finding Confluence Cloud page ${spaceKey}/${title}`).results[0];
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
      throw new Error('Confluence Cloud page locator must be a numeric page ID or an absolute page URL');
    }
    const base = new URL(this.baseUrl);
    if (url.origin !== base.origin) throw new Error(`Confluence target host must match ${base.origin}`);
    const queryId = url.searchParams.get('pageId');
    if (queryId && /^\d+$/.test(queryId)) return this.getPage(queryId);
    const match = url.pathname.match(/\/(?:pages|content)\/(\d+)(?:\/|$)/);
    if (match?.[1]) return this.getPage(match[1]);
    throw new Error('Could not extract a Confluence Cloud page ID from --destination/--source');
  }

  async createPage(input: {spaceKey: string; parentId: string; title: string; storage: string}): Promise<ConfluencePage> {
    const space = await this.getSpaceByKey(input.spaceKey);
    const response = await this.writeLimit(() => this.http.request<unknown>({
      method: 'POST', url: '/api/v2/pages', headers: {'Content-Type': 'application/json'},
      data: {
        spaceId: space.id, status: 'current', title: input.title, parentId: input.parentId,
        body: {representation: 'storage', value: input.storage},
      },
    }));
    return this.normalizePage(parseConfluenceResponse(cloudPageSchema, response.data, `creating Confluence Cloud page "${input.title}"`));
  }

  async updatePage(input: {pageId: string; title: string; storage: string; parentId?: string; version?: number}): Promise<ConfluencePage> {
    const current = input.version ? undefined : await this.getPage(input.pageId);
    const versionNumber = input.version ?? current?.version?.number;
    if (!versionNumber) throw new Error(`Confluence Cloud page ${input.pageId} has no version information`);
    const response = await this.writeLimit(() => this.http.request<unknown>({
      method: 'PUT', url: `/api/v2/pages/${encodeURIComponent(input.pageId)}`, headers: {'Content-Type': 'application/json'},
      data: {
        id: input.pageId, status: 'current', title: input.title,
        ...(input.parentId ? {parentId: input.parentId} : {}),
        body: {representation: 'storage', value: input.storage},
        version: {number: versionNumber + 1, message: 'Transferred by ywtc'},
      },
    }));
    return this.normalizePage(parseConfluenceResponse(cloudPageSchema, response.data, `updating Confluence Cloud page ${input.pageId}`));
  }

  async findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined> {
    const response = await this.readLimit(() => this.http.request<unknown>({
      method: 'GET', url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
      params: {filename, limit: 2, expand: 'extensions,metadata'},
    }));
    const attachment = parseConfluenceList(confluenceAttachmentSchema, response.data, `finding attachment on Confluence Cloud page ${pageId}`).results[0];
    return attachment ? normalizeConfluenceAttachment(attachment) : undefined;
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
      const response = await this.http.request<unknown>({
        method: 'POST', url, headers: {...form.getHeaders(), 'X-Atlassian-Token': 'nocheck'}, data: form,
        maxBodyLength: Number.POSITIVE_INFINITY, maxContentLength: Number.POSITIVE_INFINITY,
      });
      return normalizeConfluenceAttachment(parseConfluenceAttachmentResult(response.data, `uploading attachment to Confluence Cloud page ${input.pageId}`));
    });
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    const results: ConfluenceAttachment[] = [];
    let start = 0;
    while (true) {
      const response = await this.readLimit(() => this.http.request<unknown>({
        method: 'GET', url: `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
        params: {start, limit: 100, expand: 'extensions,metadata'},
      }));
      const page = parseConfluenceList(confluenceAttachmentSchema, response.data, `listing attachments on Confluence Cloud page ${pageId}`);
      results.push(...page.results.map(normalizeConfluenceAttachment));
      const size = page.size ?? page.results.length;
      if (!page._links?.next || size === 0) break;
      start += size;
    }
    return results;
  }

  async getDescendants(pageId: string): Promise<ConfluencePage[]> {
    const results: ConfluencePage[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      if (cursor) {
        if (seenCursors.has(cursor)) throw new Error(`Confluence Cloud descendants cursor repeated for page ${pageId}: ${cursor}`);
        seenCursors.add(cursor);
      }
      const response = await this.readLimit(() => this.http.request<unknown>({
        method: 'GET',
        url: `/api/v2/pages/${encodeURIComponent(pageId)}/descendants`,
        params: {limit: 100, depth: 'all', ...(cursor ? {cursor} : {})},
      }));
      const page = parseConfluenceList(cloudPageSchema, response.data, `listing descendants of Confluence Cloud page ${pageId}`);
      for (const item of page.results) results.push(await this.normalizePage(item));
      const next = page._links?.next;
      cursor = next ? new URL(next, `${this.baseUrl}/`).searchParams.get('cursor') ?? undefined : undefined;
    } while (cursor);
    return results;
  }

  private async pagedComments(url: string): Promise<CloudCommentPayload[]> {
    const results: CloudCommentPayload[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      if (cursor) {
        if (seen.has(cursor)) throw new Error(`Confluence Cloud comment cursor repeated for ${url}: ${cursor}`);
        seen.add(cursor);
      }
      const response = await this.readLimit(() => this.http.request<unknown>({
        method: 'GET', url, params: {limit: 100, 'body-format': 'storage', ...(cursor ? {cursor} : {})},
      }));
      const page = parseConfluenceList(cloudCommentSchema, response.data, `listing Confluence Cloud comments from ${url}`);
      results.push(...page.results);
      const next = page._links?.next;
      cursor = next ? new URL(next, `${this.baseUrl}/`).searchParams.get('cursor') ?? undefined : undefined;
    } while (cursor);
    return results;
  }

  private async resolveUsers(ids: string[]): Promise<void> {
    const missing = [...new Set(ids.filter((id) => id && !this.usersById.has(id)))];
    for (let index = 0; index < missing.length; index += 100) {
      const batch = missing.slice(index, index + 100);
      const response = await this.readLimit(() => this.http.request<unknown>({
        method: 'GET', url: '/api/v2/users-bulk', params: {'account-ids': batch.join(','), limit: 100},
      }));
      const page = parseConfluenceList(cloudUserSchema, response.data, 'resolving Confluence Cloud comment authors');
      for (const user of page.results) this.usersById.set(user.accountId, user);
    }
  }

  private normalizeComment(comment: CloudCommentPayload): ConfluenceComment {
    const user = comment.authorId ? this.usersById.get(comment.authorId) : undefined;
    const body = comment.body?.storage
      ?? (comment.body?.value !== undefined ? {value: comment.body.value, representation: comment.body.representation ?? 'storage'} : undefined);
    return {
      id: comment.id,
      ...(comment.status ? {status: comment.status} : {}),
      ...(comment.title ? {title: comment.title} : {}),
      ...(comment.parentCommentId ? {parentCommentId: comment.parentCommentId} : {}),
      ...(comment.createdAt ? {createdAt: comment.createdAt} : {}),
      ...(comment.resolutionStatus ? {resolutionStatus: comment.resolutionStatus} : {}),
      ...(comment.inlineContext ? {inlineContext: comment.inlineContext} : {}),
      author: {
        ...(comment.authorId ? {accountId: comment.authorId} : {}),
        ...(user?.displayName ? {displayName: user.displayName} : {}),
        ...(user?.publicName ? {publicName: user.publicName} : {}),
        ...(user?.email ? {email: user.email} : {}),
      },
      ...(comment.version ? {version: comment.version} : {}),
      ...(body ? {body: {storage: body}} : {}),
      ...(comment._links ? {_links: {
        ...(comment._links.webui ? {webui: comment._links.webui} : {}),
        ...(comment._links.self ? {self: comment._links.self} : {}),
      }} : {}),
    };
  }

  async getPageComments(pageId: string): Promise<ConfluenceComment[]> {
    const collected: CloudCommentPayload[] = [];
    const walk = async (kind: 'footer' | 'inline', comment: CloudCommentPayload): Promise<void> => {
      collected.push(comment);
      const children = await this.pagedComments(`/api/v2/${kind}-comments/${encodeURIComponent(comment.id)}/children`);
      for (const child of children) {
        if (!child.parentCommentId) child.parentCommentId = comment.id;
        await walk(kind, child);
      }
    };
    const [footer, inline] = await Promise.all([
      this.pagedComments(`/api/v2/pages/${encodeURIComponent(pageId)}/footer-comments`),
      this.pagedComments(`/api/v2/pages/${encodeURIComponent(pageId)}/inline-comments`),
    ]);
    for (const comment of footer) await walk('footer', comment);
    for (const comment of inline) await walk('inline', comment);
    await this.resolveUsers(collected.flatMap((comment) => comment.authorId ? [comment.authorId] : []));
    const unique = new Map<string, CloudCommentPayload>();
    for (const comment of collected) if (!unique.has(comment.id)) unique.set(comment.id, comment);
    return [...unique.values()].map((comment) => this.normalizeComment(comment));
  }

  async getComment(commentId: string): Promise<ConfluenceComment> {
    const response = await this.readLimit(() => this.http.request<unknown>({
      method: 'GET', url: `/api/v2/footer-comments/${encodeURIComponent(commentId)}`, params: {'body-format': 'storage'},
    }));
    const comment = parseConfluenceResponse(cloudCommentSchema, response.data, `reading Confluence Cloud comment ${commentId}`);
    if (comment.authorId) await this.resolveUsers([comment.authorId]);
    return this.normalizeComment(comment);
  }

  async createComment(input: {pageId: string; storage: string}): Promise<ConfluenceComment> {
    const response = await this.writeLimit(() => this.http.request<unknown>({
      method: 'POST', url: '/api/v2/footer-comments', headers: {'Content-Type': 'application/json'},
      data: {pageId: input.pageId, body: {representation: 'storage', value: input.storage}},
      retryMode: 'never',
    }));
    return this.normalizeComment(parseConfluenceResponse(cloudCommentSchema, response.data, `creating a comment on Confluence Cloud page ${input.pageId}`));
  }

  async updateComment(input: {commentId: string; storage: string; version?: number}): Promise<ConfluenceComment> {
    const current = input.version ? undefined : await this.getComment(input.commentId);
    const version = input.version ?? current?.version?.number;
    if (!version) throw new Error(`Confluence Cloud comment ${input.commentId} has no version information`);
    const response = await this.writeLimit(() => this.http.request<unknown>({
      method: 'PUT', url: `/api/v2/footer-comments/${encodeURIComponent(input.commentId)}`,
      headers: {'Content-Type': 'application/json'},
      data: {version: {number: version + 1, message: 'Comment archive updated by ywtc'}, body: {representation: 'storage', value: input.storage}},
      retryMode: 'never',
    }));
    return this.normalizeComment(parseConfluenceResponse(cloudCommentSchema, response.data, `updating Confluence Cloud comment ${input.commentId}`));
  }

  async downloadAttachment(pageId: string, attachment: ConfluenceAttachment, destination: string): Promise<DownloadedFile> {
    return this.readLimit(async () => {
      const link = attachment._links?.download ?? `/download/attachments/${encodeURIComponent(pageId)}/${encodeURIComponent(attachment.title)}`;
      const base = new URL(this.baseUrl);
      const url = /^https?:\/\//i.test(link)
        ? link
        : link.startsWith('/download/') ? `${this.baseUrl}${link}` : new URL(link, base.origin).toString();
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
    if (page._links?.webui) return new URL(page._links.webui, `${this.baseUrl}/`).toString();
    return `${this.baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(page.id)}`;
  }
}
