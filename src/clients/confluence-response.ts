import {z} from 'zod';
import type {ConfluenceAttachment, ConfluencePage} from '../types.js';

export type ConfluenceResponseFailureKind = 'service-unavailable' | 'invalid-response';

export class ConfluenceResponseError extends Error {
  constructor(
    readonly kind: ConfluenceResponseFailureKind,
    readonly operation: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConfluenceResponseError';
  }
}

const identifier = z.union([z.string().min(1), z.number()]).transform(String);
const optionalIdentifier = identifier.optional();
const links = z.object({
  next: z.string().optional(),
  webui: z.string().optional(),
  base: z.string().optional(),
  self: z.string().optional(),
  download: z.string().optional(),
}).passthrough();
const storage = z.object({value: z.string(), representation: z.string()}).passthrough();
const version = z.object({number: z.number()}).passthrough();

export const dataCenterPageSchema = z.object({
  id: identifier,
  type: z.literal('page').optional().default('page'),
  status: z.string().optional(),
  title: z.string(),
  space: z.object({
    key: z.string().min(1),
    id: optionalIdentifier,
    name: z.string().optional(),
  }).passthrough(),
  ancestors: z.array(z.object({id: identifier}).passthrough()).optional(),
  version: version.optional(),
  body: z.object({
    storage: storage.optional(),
    view: storage.optional(),
  }).passthrough().optional(),
  operations: z.array(z.object({operation: z.string(), targetType: z.string()}).passthrough()).optional(),
  _links: links.optional(),
}).passthrough();

export const confluenceAttachmentSchema = z.object({
  id: identifier,
  title: z.string(),
  metadata: z.object({mediaType: z.string().optional()}).passthrough().optional(),
  extensions: z.object({fileSize: z.number().nonnegative().optional()}).passthrough().optional(),
  _links: links.optional(),
}).passthrough();

export const dataCenterCommentSchema = z.object({
  id: identifier,
  type: z.string().optional(),
  status: z.string().optional(),
  title: z.string().optional(),
  ancestors: z.array(z.object({id: identifier, type: z.string().optional()}).passthrough()).optional(),
  version: z.object({
    number: z.number(),
    when: z.string().optional(),
    by: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
  history: z.object({
    createdDate: z.string().optional(),
    createdBy: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
  body: z.object({storage: storage.optional()}).passthrough().optional(),
  extensions: z.object({
    location: z.string().optional(),
    resolutionStatus: z.string().optional(),
    inlineProperties: z.object({originalSelection: z.string().optional()}).passthrough().optional(),
    parentCommentId: identifier.optional(),
  }).passthrough().optional(),
  _links: links.optional(),
}).passthrough();

export const dataCenterSystemInfoSchema = z.object({
  version: z.string().optional(),
  versionNumber: z.string().optional(),
}).passthrough();

export const confluenceUserSchema = z.object({
  accountId: z.string().optional(),
  username: z.string().optional(),
  userKey: z.string().optional(),
  displayName: z.string().optional(),
}).passthrough().refine(
  (user) => Boolean(user.accountId || user.username || user.userKey || user.displayName),
  {message: 'current user identity is missing'},
);

export const cloudPageSchema = z.object({
  id: identifier,
  status: z.string().optional(),
  title: z.string(),
  spaceId: identifier,
  parentId: optionalIdentifier,
  version: version.optional(),
  body: z.object({storage: storage.optional()}).passthrough().optional(),
  operations: z.array(z.object({operation: z.string(), targetType: z.string()}).passthrough()).optional(),
  _links: links.optional(),
}).passthrough();

export const cloudSpaceSchema = z.object({
  id: identifier,
  key: z.string().min(1),
  name: z.string().optional(),
}).passthrough();

export const cloudCommentSchema = z.object({
  id: identifier,
  status: z.string().optional(),
  title: z.string().optional(),
  authorId: optionalIdentifier,
  parentCommentId: optionalIdentifier,
  createdAt: z.string().optional(),
  resolutionStatus: z.string().optional(),
  inlineContext: z.string().optional(),
  version: version.optional(),
  body: z.object({
    storage: storage.optional(),
    value: z.string().optional(),
    representation: z.string().optional(),
  }).passthrough().optional(),
  _links: links.optional(),
}).passthrough();

export const cloudUserSchema = z.object({
  accountId: identifier,
  displayName: z.string().optional(),
  publicName: z.string().optional(),
  email: z.string().optional(),
}).passthrough();

export type DataCenterCommentPayload = z.infer<typeof dataCenterCommentSchema>;
export type CloudPagePayload = z.infer<typeof cloudPageSchema>;
export type CloudSpacePayload = z.infer<typeof cloudSpaceSchema>;
export type CloudCommentPayload = z.infer<typeof cloudCommentSchema>;
export type CloudUserPayload = z.infer<typeof cloudUserSchema>;

type DataCenterPagePayload = z.infer<typeof dataCenterPageSchema>;
type ConfluenceAttachmentPayload = z.infer<typeof confluenceAttachmentSchema>;

export function normalizeDataCenterPage(page: DataCenterPagePayload): ConfluencePage {
  const storageBody = page.body?.storage;
  const viewBody = page.body?.view;
  return {
    id: page.id,
    type: 'page',
    ...(page.status ? {status: page.status} : {}),
    title: page.title,
    space: {
      key: page.space.key,
      ...(page.space.id ? {id: page.space.id} : {}),
      ...(page.space.name ? {name: page.space.name} : {}),
    },
    ...(page.ancestors ? {ancestors: page.ancestors.map(({id}) => ({id}))} : {}),
    ...(page.version ? {version: {number: page.version.number}} : {}),
    ...(storageBody || viewBody ? {
      body: {
        ...(storageBody ? {storage: {value: storageBody.value, representation: storageBody.representation}} : {}),
        ...(viewBody ? {view: {value: viewBody.value, representation: viewBody.representation}} : {}),
      },
    } : {}),
    ...(page.operations ? {operations: page.operations.map(({operation, targetType}) => ({operation, targetType}))} : {}),
    ...(page._links ? {
      _links: {
        ...(page._links.webui ? {webui: page._links.webui} : {}),
        ...(page._links.base ? {base: page._links.base} : {}),
        ...(page._links.self ? {self: page._links.self} : {}),
      },
    } : {}),
  };
}

export function normalizeConfluenceAttachment(attachment: ConfluenceAttachmentPayload): ConfluenceAttachment {
  return {
    id: attachment.id,
    title: attachment.title,
    ...(attachment.metadata?.mediaType ? {metadata: {mediaType: attachment.metadata.mediaType}} : {}),
    ...(attachment.extensions?.fileSize !== undefined ? {extensions: {fileSize: attachment.extensions.fileSize}} : {}),
    ...(attachment._links ? {
      _links: {
        ...(attachment._links.download ? {download: attachment._links.download} : {}),
        ...(attachment._links.webui ? {webui: attachment._links.webui} : {}),
      },
    } : {}),
  };
}

function confluenceListSchema<T extends z.ZodType>(item: T) {
  return z.object({
    results: z.array(item),
    start: z.number().optional(),
    limit: z.number().optional(),
    size: z.number().nonnegative().optional(),
    _links: links.optional(),
  }).passthrough();
}

function isHtml(value: string): boolean {
  return /<!doctype\s+html|<html\b|<head\b|<body\b|<title\b|<h1\b/iu.test(value);
}

function issuePaths(error: z.ZodError): string {
  const paths = error.issues.slice(0, 5).map((issue) => issue.path.length > 0 ? issue.path.join('.') : 'response');
  return [...new Set(paths)].join(', ');
}

export function parseConfluenceResponse<T>(schema: z.ZodType<T>, payload: unknown, operation: string): T {
  if (typeof payload === 'string' && isHtml(payload)) {
    throw new ConfluenceResponseError(
      'service-unavailable',
      operation,
      `Confluence is unavailable or not fully started while ${operation}: received an HTML startup/error page instead of REST JSON. Retry after Confluence startup and attachment storage connectivity are restored; if the service is healthy, check baseUrl and deployment.`,
    );
  }
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw new ConfluenceResponseError(
    'invalid-response',
    operation,
    `Confluence API returned an invalid response while ${operation}: missing or invalid ${issuePaths(result.error)}. Check baseUrl, deployment, provider health, and API compatibility.`,
    {cause: result.error},
  );
}

export function parseConfluenceList<T>(schema: z.ZodType<T>, payload: unknown, operation: string) {
  return parseConfluenceResponse(confluenceListSchema(schema), payload, operation);
}

export function parseConfluenceAttachmentResult(payload: unknown, operation: string) {
  const direct = confluenceAttachmentSchema.safeParse(payload);
  if (direct.success) return direct.data;
  const list = parseConfluenceList(confluenceAttachmentSchema, payload, operation);
  const first = list.results[0];
  if (first) return first;
  throw new ConfluenceResponseError(
    'invalid-response',
    operation,
    `Confluence API returned an empty attachment result while ${operation}. Check provider health and attachment API compatibility.`,
  );
}
