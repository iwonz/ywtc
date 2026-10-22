import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {HttpRequestError} from './http.js';
import type {
  CommentInventory,
  NormalizedDocument,
  SourcePage,
  SourceResource,
  SourceResourceInventoryFailure,
  SourceStatus,
  TransferScope,
} from './domain.js';

export type SourceInventoryOperation =
  | 'page-detail'
  | 'attachments-list'
  | 'grids-list'
  | 'grid-read'
  | 'resources-list'
  | 'comments-read'
  | 'normalization'
  | 'checkpoint-read'
  | 'checkpoint-write';

export class SourceInventoryOperationError extends Error {
  constructor(
    readonly operation: SourceInventoryOperation,
    message: string,
    readonly retryable: boolean,
    readonly details: {
      status?: number;
      code?: string;
      endpoint?: string;
      attempts?: number;
    } = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SourceInventoryOperationError';
  }
}

export function sourceInventoryOperationError(
  operation: SourceInventoryOperation,
  error: unknown,
  endpoint?: string,
): SourceInventoryOperationError {
  if (error instanceof SourceInventoryOperationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof HttpRequestError) {
    const retryable = error.status === 429
      || (error.status ?? 0) >= 500
      || (error.status === undefined && error.code !== 'ERR_CANCELED');
    return new SourceInventoryOperationError(operation, message, retryable, {
      ...(error.status !== undefined ? {status: error.status} : {}),
      ...(error.code ? {code: error.code} : {}),
      ...((endpoint ?? error.url) ? {endpoint: endpoint ?? error.url!} : {}),
      attempts: error.attempts,
    }, {cause: error});
  }
  return new SourceInventoryOperationError(operation, message, false, {
    ...(endpoint ? {endpoint} : {}),
    attempts: 1,
  }, {cause: error});
}

export function sourceInventoryIssueCode(error: SourceInventoryOperationError): string {
  const prefix = error.details.status === 429
    ? 'rate-limit'
    : (error.details.status ?? 0) >= 500 || (error.retryable && error.details.status === undefined)
      ? 'network'
      : 'source';
  if (error.operation === 'page-detail') return `${prefix}-source-page-detail`;
  return `${prefix}-inventory-${error.operation}`;
}

export function sourceResourceInventoryFailure(error: SourceInventoryOperationError): SourceResourceInventoryFailure {
  if (error.operation !== 'grid-read') {
    throw new Error(`Source resource inventory failure does not support ${error.operation}`);
  }
  return {
    operation: error.operation,
    code: sourceInventoryIssueCode(error),
    message: error.message,
    retryable: error.retryable,
    ...(error.details.status !== undefined ? {status: error.details.status} : {}),
    ...(error.details.endpoint ? {endpoint: error.details.endpoint} : {}),
    ...(error.details.attempts !== undefined ? {attempts: error.details.attempts} : {}),
  };
}

export interface SourceInventorySnapshotOptions {
  cacheDirectory: string;
  stateId: string;
  runId: string;
  sourceCanonicalId: string;
  sourceProfile: string;
  sourceProvider: string;
  scope: TransferScope;
  sourceStatus: SourceStatus;
  commentsEnabled: boolean;
  fresh: boolean;
}

interface SourceInventoryManifest {
  stateId: string;
  generation: string;
  runId: string;
  sourceCanonicalId: string;
  sourceProfile: string;
  sourceProvider: string;
  scope: TransferScope;
  sourceStatus: SourceStatus;
  commentsEnabled: boolean;
  lifecycle: 'collecting' | 'ready' | 'retired';
  createdAt: string;
  updatedAt: string;
}

export interface SourceInventoryPageRecord {
  canonicalId: string;
  locator: string;
  sourceFingerprint: string;
  stage: 'discovered' | 'complete';
  page: SourcePage;
  resources?: SourceResource[];
  document?: NormalizedDocument;
  comments?: CommentInventory;
  updatedAt: string;
}

const sourcePageSchema = z.object({
  provider: z.enum(['yandex-wiki', 'confluence']),
  profile: z.string().min(1),
  id: z.string().min(1),
  canonicalId: z.string().min(1),
  title: z.string(),
  locator: z.string(),
  url: z.string(),
  rawContent: z.string(),
  rawFormat: z.enum(['yfm', 'confluence-storage']),
  references: z.array(z.unknown()),
}).passthrough();

const sourceResourceSchema = z.object({
  provider: z.enum(['yandex-wiki', 'confluence']),
  id: z.string().min(1),
  pageId: z.string().min(1),
  name: z.string(),
  kind: z.enum(['attachment', 'image', 'grid']),
  inventoryFailure: z.object({
    operation: z.literal('grid-read'),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    status: z.number().int().optional(),
    endpoint: z.string().optional(),
    attempts: z.number().int().positive().optional(),
  }).optional(),
}).passthrough();

const normalizedDocumentSchema = z.object({
  root: z.object({type: z.string()}).passthrough(),
  raw: z.string(),
  rawFormat: z.enum(['yfm', 'confluence-storage']),
  references: z.array(z.unknown()),
  warnings: z.array(z.string()),
  normalizations: z.array(z.string()),
  adaptations: z.array(z.string()),
  notices: z.array(z.unknown()),
  degraded: z.boolean(),
  semanticallyEmpty: z.boolean(),
  metrics: z.object({
    links: z.number().int().nonnegative(),
    images: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    codeBlocks: z.number().int().nonnegative(),
    preservedExternalReferences: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough();

const commentInventorySchema = z.object({
  status: z.enum(['complete', 'empty', 'failed', 'skipped']),
  threads: z.array(z.unknown()),
  comments: z.number().int().nonnegative(),
  participants: z.number().int().nonnegative(),
  attachments: z.number().int().nonnegative(),
  knownBytes: z.number().int().nonnegative(),
  unknownSizes: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
}).passthrough();

const manifestSchema = z.object({
  stateId: z.string().regex(/^[a-f\d]{24}$/u),
  generation: z.string().uuid(),
  runId: z.string().uuid(),
  sourceCanonicalId: z.string().min(1),
  sourceProfile: z.string().min(1),
  sourceProvider: z.string().min(1),
  scope: z.enum(['page', 'subtree', 'linked']),
  sourceStatus: z.enum(['all', 'current']),
  commentsEnabled: z.boolean(),
  lifecycle: z.enum(['collecting', 'ready', 'retired']),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

const pageRecordSchema = z.object({
  canonicalId: z.string().min(1),
  locator: z.string(),
  sourceFingerprint: z.string().regex(/^[a-f\d]{64}$/u),
  stage: z.enum(['discovered', 'complete']),
  page: sourcePageSchema,
  resources: z.array(sourceResourceSchema).optional(),
  document: normalizedDocumentSchema.optional(),
  comments: commentInventorySchema.optional(),
  updatedAt: z.string(),
}).strict().superRefine((record, context) => {
  if (record.page.canonicalId !== record.canonicalId || record.page.locator !== record.locator) {
    context.addIssue({code: 'custom', message: 'Checkpoint page identity does not match its record'});
  }
  if (record.stage === 'complete' && (!record.resources || !record.document)) {
    context.addIssue({code: 'custom', message: 'Complete checkpoint is missing resources or document'});
  }
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourcePageFingerprint(page: SourcePage): string {
  const availability = page.contentAvailability
    ? `${page.contentAvailability.status}:${page.contentAvailability.sourceType}:${page.contentAvailability.reason}`
    : 'available';
  return hash(`${page.title}\0${page.rawContent}\0${page.version ?? ''}\0${availability}`);
}

function contained(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Inventory checkpoint path escapes its cache root: ${candidate}`);
  }
  return resolvedCandidate;
}

async function atomicJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), {recursive: true, mode: 0o700});
  const temporary = `${filename}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {mode: 0o600});
  await rename(temporary, filename);
}

async function readJson(filename: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(filename, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

function compatible(manifest: SourceInventoryManifest, options: SourceInventorySnapshotOptions): boolean {
  return manifest.lifecycle !== 'retired'
    && manifest.stateId === options.stateId
    && manifest.sourceCanonicalId === options.sourceCanonicalId
    && manifest.sourceProfile === options.sourceProfile
    && manifest.sourceProvider === options.sourceProvider
    && manifest.scope === options.scope
    && manifest.sourceStatus === options.sourceStatus
    && manifest.commentsEnabled === options.commentsEnabled;
}

export class SourceInventoryStore {
  readonly reused: boolean;
  readonly resumedFromRunId: string | undefined;
  private manifest: SourceInventoryManifest;
  private readonly root: string;
  private readonly manifestFilename: string;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    root: string,
    manifestFilename: string,
    manifest: SourceInventoryManifest,
    reused: boolean,
    resumedFromRunId?: string,
  ) {
    this.root = root;
    this.manifestFilename = manifestFilename;
    this.manifest = manifest;
    this.reused = reused;
    this.resumedFromRunId = resumedFromRunId;
  }

  static async open(options: SourceInventorySnapshotOptions): Promise<SourceInventoryStore> {
    if (!/^[a-f\d]{24}$/u.test(options.stateId)) {
      throw new Error(`Invalid source inventory state identity: ${options.stateId}`);
    }
    const inventoryRoot = contained(options.cacheDirectory, path.join(options.cacheDirectory, 'inventory', options.stateId));
    const manifestFilename = contained(inventoryRoot, path.join(inventoryRoot, 'manifest.json'));
    const parsed = manifestSchema.safeParse(await readJson(manifestFilename));
    const existing = parsed.success ? parsed.data as SourceInventoryManifest : undefined;
    const canReuse = !options.fresh && existing !== undefined && compatible(existing, options);
    const now = new Date().toISOString();
    const manifest: SourceInventoryManifest = canReuse
      ? {...existing, runId: options.runId, updatedAt: now}
      : {
        stateId: options.stateId,
        generation: randomUUID(),
        runId: options.runId,
        sourceCanonicalId: options.sourceCanonicalId,
        sourceProfile: options.sourceProfile,
        sourceProvider: options.sourceProvider,
        scope: options.scope,
        sourceStatus: options.sourceStatus,
        commentsEnabled: options.commentsEnabled,
        lifecycle: 'collecting',
        createdAt: now,
        updatedAt: now,
      };
    await atomicJson(manifestFilename, manifest);
    return new SourceInventoryStore(inventoryRoot, manifestFilename, manifest, canReuse, canReuse ? existing?.runId : undefined);
  }

  private recordFilename(canonicalId: string): string {
    return contained(this.root, path.join(this.root, this.manifest.generation, 'pages', `${hash(canonicalId)}.json`));
  }

  async loadDiscoveredPage(canonicalId: string, locator: string): Promise<SourcePage | undefined> {
    const parsed = pageRecordSchema.safeParse(await readJson(this.recordFilename(canonicalId)));
    if (!parsed.success) return undefined;
    const record = parsed.data as SourceInventoryPageRecord;
    if (record.canonicalId !== canonicalId || record.locator !== locator) return undefined;
    return record.page;
  }

  async loadPage(id: string, locator?: string): Promise<SourcePage | undefined> {
    const canonicalId = `${this.manifest.sourceProfile}:${this.manifest.sourceProvider}:${id}`;
    const record = await this.loadRecord(canonicalId);
    if (!record || (locator !== undefined && record.locator !== locator)) return undefined;
    return record.page;
  }

  async savePage(page: SourcePage): Promise<void> {
    await this.saveDiscoveredPage(page);
  }

  async saveDiscoveredPage(page: SourcePage): Promise<void> {
    const existing = await this.loadRecord(page.canonicalId);
    if (existing?.stage === 'complete' && existing.locator === page.locator && existing.sourceFingerprint === sourcePageFingerprint(page)) return;
    await this.saveRecord({
      canonicalId: page.canonicalId,
      locator: page.locator,
      sourceFingerprint: sourcePageFingerprint(page),
      stage: 'discovered',
      page,
      updatedAt: new Date().toISOString(),
    });
  }

  async loadComplete(page: SourcePage): Promise<SourceInventoryPageRecord | undefined> {
    const record = await this.loadRecord(page.canonicalId);
    if (
      record?.stage !== 'complete'
      || record.locator !== page.locator
      || record.sourceFingerprint !== sourcePageFingerprint(page)
      || !record.resources
      || !record.document
    ) return undefined;
    return record;
  }

  async saveComplete(input: {
    page: SourcePage;
    resources: SourceResource[];
    document: NormalizedDocument;
    comments?: CommentInventory;
  }): Promise<void> {
    await this.saveRecord({
      canonicalId: input.page.canonicalId,
      locator: input.page.locator,
      sourceFingerprint: sourcePageFingerprint(input.page),
      stage: 'complete',
      page: input.page,
      resources: input.resources,
      document: input.document,
      ...(input.comments ? {comments: input.comments} : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  async markReady(): Promise<void> {
    await this.setLifecycle('ready');
  }

  async retire(): Promise<void> {
    await this.setLifecycle('retired');
  }

  get lifecycle(): SourceInventoryManifest['lifecycle'] {
    return this.manifest.lifecycle;
  }

  private async loadRecord(canonicalId: string): Promise<SourceInventoryPageRecord | undefined> {
    const parsed = pageRecordSchema.safeParse(await readJson(this.recordFilename(canonicalId)));
    return parsed.success ? parsed.data as SourceInventoryPageRecord : undefined;
  }

  private async saveRecord(record: SourceInventoryPageRecord): Promise<void> {
    const parsed = pageRecordSchema.parse(record);
    const write = this.writeChain.catch(() => undefined).then(() => atomicJson(this.recordFilename(record.canonicalId), parsed));
    this.writeChain = write;
    await write;
  }

  private async setLifecycle(lifecycle: SourceInventoryManifest['lifecycle']): Promise<void> {
    this.manifest = {...this.manifest, lifecycle, updatedAt: new Date().toISOString()};
    await atomicJson(this.manifestFilename, this.manifest);
  }
}
