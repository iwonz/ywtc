import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Transform, type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import pLimit, {type LimitFunction} from 'p-limit';
import {z} from 'zod';
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
      return parseResponse(pageSchema, response.data, 'GET /pages by slug') as YandexPageDetails;
    });
  }

  async getPageById(id: number): Promise<YandexPageDetails> {
    return this.apiLimit(async () => {
      const response = await this.authenticated.request<YandexPageDetails>({
        method: 'GET',
        url: `/pages/${id}`,
        params: {fields: 'breadcrumbs,redirect,attributes,content'},
      });
      return parseResponse(pageSchema, response.data, `GET /pages/${id}`) as YandexPageDetails;
    });
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
    return this.apiLimit(() => this.paginate<YandexPageIdentity>(`/pages/${id}/descendants`, pageIdentitySchema, {
      actuality: 'actual',
      include_self: false,
    }));
  }

  getAttachments(pageId: number): Promise<YandexAttachment[]> {
    return this.apiLimit(() => this.paginate<YandexAttachment>(`/pages/${pageId}/attachments`, attachmentSchema, {order_by: 'name'}));
  }

  getPageGrids(pageId: number): Promise<YandexGridSummary[]> {
    return this.apiLimit(() => this.paginate<YandexGridSummary>(`/pages/${pageId}/grids`, gridSummarySchema, {order_by: 'created_at'}));
  }

  async getGrid(id: string): Promise<YandexGrid> {
    return this.apiLimit(async () => {
      const response = await this.authenticated.request<YandexGrid>({
        method: 'GET',
        url: `/grids/${encodeURIComponent(id)}`,
        params: {fields: 'attributes'},
      });
      return parseResponse(gridSchema, response.data, `GET /grids/${id}`) as YandexGrid;
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
