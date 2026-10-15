import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Transform, type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import PQueue from 'p-queue';
import {z} from 'zod';
import type {NetworkLimits, YandexConnectionProfile} from '../config.js';
import {RetryingHttpClient} from '../http.js';
import {RequestRateLimiter} from '../rate-limiter.js';
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

const pageIdentitySchema = z.object({id: z.number().int(), slug: z.string().min(1)}).passthrough();
const breadcrumbSchema = z.object({
  id: z.number().int().optional(), slug: z.string(), title: z.string(), page_exists: z.boolean().optional(),
}).passthrough();
const pageSchema = z.object({
  id: z.number().int(),
  slug: z.string().min(1),
  title: z.string(),
  page_type: z.enum(['page', 'grid', 'wysiwyg', 'template']),
  content: z.string().optional(),
  breadcrumbs: z.array(breadcrumbSchema).optional(),
  redirect: z.object({
    page_id: z.number().int(),
    redirect_target: z.object({
      id: z.number().int(), slug: z.string(), title: z.string(),
      page_type: z.enum(['page', 'grid', 'wysiwyg', 'template']).nullable().optional(),
    }).passthrough(),
  }).passthrough().nullable().optional(),
  attributes: z.object({
    created_at: z.string().optional(), modified_at: z.string().optional(), lang: z.string().optional(),
    is_readonly: z.boolean().optional(), is_draft: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();
const attachmentSchema = z.object({
  id: z.number().int(), name: z.string().min(1), is_downloadable: z.boolean(), download_url: z.string(),
  size: z.union([z.string(), z.number()]), description: z.string().optional(), created_at: z.string().optional(),
  mimetype: z.string().optional(), has_preview: z.boolean().optional(), check_status: z.string().optional(),
}).passthrough();
const gridSummarySchema = z.object({id: z.string(), title: z.string(), created_at: z.string().optional()}).passthrough();
const gridSchema = z.object({
  id: z.union([z.string(), z.number()]), title: z.string(),
  page: pageIdentitySchema.optional(),
  structure: z.object({
    columns: z.array(z.object({
      id: z.string().optional(), slug: z.string(), title: z.string(), type: z.string().optional(),
      format: z.enum(['yfm', 'wom', 'plain']).nullable().optional(),
      width: z.union([z.number(), z.string()]).nullable().optional().transform((value) => {
        if (value === undefined || value === null) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }),
      width_units: z.enum(['%', 'px']).nullable().optional(),
    }).passthrough()),
    default_sort: z.array(z.unknown()).optional(),
  }).passthrough(),
  rows: z.array(z.object({
    id: z.string(), row: z.array(z.unknown()), pinned: z.boolean().nullable().optional().transform((value) => value ?? undefined),
    color: z.string().nullable().optional().transform((value) => value ?? undefined),
  }).passthrough()),
  rich_text_format: z.enum(['yfm', 'wom', 'plain']).optional(), revision: z.string().optional(),
}).passthrough();

function parseResponse<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => issue.path.join('.') || 'response').join(', ');
  throw new Error(`Yandex Wiki Public API v1 schema error in ${operation}: missing or invalid ${fields}`);
}

export class YandexWikiClient implements YandexWikiApi {
  private readonly authenticated: RetryingHttpClient;
  private readonly readQueue: PQueue;
  private readonly writeQueue: PQueue;
  private readonly downloadQueue: PQueue;
  private readonly uploadQueue: PQueue;

  constructor(
    public readonly config: YandexConnectionProfile,
    timeoutMs: number,
    limits: NetworkLimits = {
      readConcurrency: 4,
      writeConcurrency: 2,
      downloadConcurrency: 2,
      uploadConcurrency: 2,
      requestsPerSecond: 8,
      burst: 8,
    },
  ) {
    const authorization = config.authType === 'oauth' ? `OAuth ${config.token}` : `Bearer ${config.token}`;
    const orgHeader = config.organization.type === 'yandex360' ? 'X-Org-Id' : 'X-Cloud-Org-Id';
    const rateLimiter = new RequestRateLimiter(limits);
    this.readQueue = new PQueue({concurrency: limits.readConcurrency});
    this.writeQueue = new PQueue({concurrency: limits.writeConcurrency});
    this.downloadQueue = new PQueue({concurrency: limits.downloadConcurrency});
    this.uploadQueue = new PQueue({concurrency: limits.uploadConcurrency});
    this.authenticated = new RetryingHttpClient({
      baseURL: config.apiUrl,
      timeoutMs,
      rateLimiter,
      headers: {
        Authorization: authorization,
        [orgHeader]: config.organization.id,
        Accept: 'application/json',
      },
    });
  }

  async getPageBySlug(slug: string): Promise<YandexPageDetails> {
    return this.readQueue.add(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'GET',
        url: '/pages',
        params: {slug, fields: 'breadcrumbs,redirect,attributes,content'},
      });
      return parseResponse(pageSchema, response.data, 'GET /pages by slug') as YandexPageDetails;
    }) as Promise<YandexPageDetails>;
  }

  async getPageById(id: number): Promise<YandexPageDetails> {
    return this.readQueue.add(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'GET',
        url: `/pages/${id}`,
        params: {fields: 'breadcrumbs,redirect,attributes,content'},
      });
      return parseResponse(pageSchema, response.data, `GET /pages/${id}`) as YandexPageDetails;
    }) as Promise<YandexPageDetails>;
  }

  private async paginate<T>(url: string, schema: z.ZodType<unknown>, params: Record<string, unknown> = {}): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.authenticated.request<CursorPage<T>>({
        method: 'GET',
        url,
        params: {...params, page_size: 100, ...(cursor ? {cursor} : {})},
      });
      const page = parseResponse(
        z.object({results: z.array(schema), next_cursor: z.string().nullable().optional()}).passthrough(),
        response.data,
        `GET ${url}`,
      );
      results.push(...page.results as T[]);
      cursor = page.next_cursor || undefined;
    } while (cursor);
    return results;
  }

  getDescendants(id: number): Promise<YandexPageIdentity[]> {
    return this.readQueue.add(() => this.paginate<YandexPageIdentity>(`/pages/${id}/descendants`, pageIdentitySchema, {
      actuality: 'actual',
      include_self: false,
    })) as Promise<YandexPageIdentity[]>;
  }

  getAttachments(pageId: number): Promise<YandexAttachment[]> {
    return this.readQueue.add(() => this.paginate<YandexAttachment>(`/pages/${pageId}/attachments`, attachmentSchema, {order_by: 'name'})) as Promise<YandexAttachment[]>;
  }

  getPageGrids(pageId: number): Promise<YandexGridSummary[]> {
    return this.readQueue.add(() => this.paginate<YandexGridSummary>(`/pages/${pageId}/grids`, gridSummarySchema, {order_by: 'created_at'})) as Promise<YandexGridSummary[]>;
  }

  async getGrid(id: string): Promise<YandexGrid> {
    return this.readQueue.add(async () => {
      const response = await this.authenticated.request<YandexGrid>({
        method: 'GET',
        url: `/grids/${encodeURIComponent(id)}`,
        params: {fields: 'attributes'},
      });
      return parseResponse(gridSchema, response.data, `GET /grids/${id}`) as YandexGrid;
    }) as Promise<YandexGrid>;
  }

  async download(pageId: number, attachmentId: number, destination: string): Promise<DownloadedFile> {
    return this.downloadQueue.add(async () => {
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
    }) as Promise<DownloadedFile>;
  }

  async createPage(input: {slug: string; title: string; content: string}): Promise<YandexPageDetails> {
    return this.writeQueue.add(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'POST',
        url: '/pages',
        params: {is_silent: true, fields: 'breadcrumbs,redirect,attributes,content'},
        headers: {'Content-Type': 'application/json'},
        data: {slug: input.slug, title: input.title, content: input.content, access_policy: {access_type: 'inherited'}},
        retryMode: 'never',
      });
      return parseResponse(pageSchema, response.data, 'POST /pages') as YandexPageDetails;
    }) as Promise<YandexPageDetails>;
  }

  async updatePage(input: {id: number; title: string; content: string}): Promise<YandexPageDetails> {
    return this.writeQueue.add(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'POST',
        url: `/pages/${input.id}`,
        params: {allow_merge: false, is_silent: true, fields: 'breadcrumbs,redirect,attributes,content'},
        headers: {'Content-Type': 'application/json'},
        data: {title: input.title, content: input.content},
        retryMode: 'never',
      });
      return parseResponse(pageSchema, response.data, `POST /pages/${input.id}`) as YandexPageDetails;
    }) as Promise<YandexPageDetails>;
  }

  async uploadAttachment(input: {pageId: number; filename: string; path: string; size: number}): Promise<YandexAttachment> {
    return this.uploadQueue.add(async () => {
      const session = await this.authenticated.request<{session_id: string}>({
        method: 'POST', url: '/upload_sessions', headers: {'Content-Type': 'application/json'},
        data: {file_name: input.filename, file_size: input.size}, retryMode: 'never',
      });
      if (!session.data.session_id) throw new Error('Yandex Wiki upload session response is missing session_id');
      const handle = await open(input.path, 'r');
      try {
        const chunkSize = 5 * 1_024 * 1_024;
        let partNumber = 1;
        for await (const chunk of handle.createReadStream({highWaterMark: chunkSize})) {
          await this.authenticated.request({
            method: 'PUT',
            url: `/upload_sessions/${encodeURIComponent(session.data.session_id)}/upload_part`,
            params: {part_number: partNumber},
            headers: {'Content-Type': 'application/octet-stream'},
            data: chunk,
            retryMode: 'always',
            maxBodyLength: chunkSize,
          });
          partNumber += 1;
        }
      } finally {
        await handle.close();
      }
      await this.authenticated.request({
        method: 'POST', url: `/upload_sessions/${encodeURIComponent(session.data.session_id)}/finish`, retryMode: 'never',
      });
      const attached = await this.authenticated.request<{results: unknown[]}>({
        method: 'POST', url: `/pages/${input.pageId}/attachments`, headers: {'Content-Type': 'application/json'},
        data: {upload_sessions: [session.data.session_id]}, retryMode: 'never',
      });
      const attachment = attached.data.results?.[0];
      return parseResponse(attachmentSchema, attachment, `POST /pages/${input.pageId}/attachments`) as YandexAttachment;
    }) as Promise<YandexAttachment>;
  }
}
