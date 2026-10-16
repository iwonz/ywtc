import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {acquireExclusiveLease, type ExclusiveLease} from './exclusive-lease.js';
import type {ExportFormat, GraphEdgeStatus, ProviderKind, SourceSelection, SourceStatus} from './domain.js';

export type PageTransferStatus = 'discovered' | 'planned' | 'skeleton-created' | 'not-started' | 'complete' | 'partial' | 'conflict' | 'failed' | 'blocked';
export type RunStatus = 'running' | 'completed' | 'completed-with-warnings' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
export type ResourceTransferStatus = 'planned' | 'not-started' | 'blocked' | 'complete' | 'partial' | 'failed';
export type CommentTransferStatus = 'planned' | 'not-started' | 'blocked' | 'complete' | 'partial' | 'failed' | 'conflict' | 'stale' | 'skipped';

export interface BlockingCause {
  blockedByPageId?: string;
  blockedByCode?: string;
  blockedReason?: string;
}

export interface ConflictEvidence {
  reason: 'duplicate-source-mapping' | 'immutable-id-mismatch' | 'ambiguous-ownership-candidates';
  candidateIds: string[];
}

export interface EndpointIdentity {
  profile: string;
  provider: ProviderKind;
  instance: string;
  objectId: string;
  containerId?: string;
}

export interface DirectoryIdentity {
  provider: 'filesystem';
  path: string;
  format: ExportFormat;
}

export interface TransferIdentity {
  source: EndpointIdentity;
  destination: EndpointIdentity | DirectoryIdentity;
}

export interface ResourceTransferState extends BlockingCause {
  sourceId: string;
  sourceName: string;
  destinationId?: string;
  destinationName: string;
  destinationUrl?: string;
  sha256?: string;
  size?: number;
  cachePath?: string;
  mimeType?: string;
  status: ResourceTransferStatus;
  lastError?: string;
  updatedAt: string;
}

export interface CommentTransferState extends BlockingCause {
  fingerprint?: string;
  destinationId?: string;
  destinationFingerprint?: string;
  destinationVersion?: string;
  destinationUrl?: string;
  previousDestinationIds?: string[];
  archiveResourceId?: string;
  archiveName?: string;
  archiveUrl?: string;
  archivePath?: string;
  archiveSha256?: string;
  fullArchiveResourceId?: string;
  fullArchiveName?: string;
  fullArchivePath?: string;
  fullArchiveSha256?: string;
  status: CommentTransferStatus;
  threads: number;
  comments: number;
  participants: number;
  attachments: number;
  bytes: number;
  preview?: string;
  lastError?: string;
  updatedAt: string;
}

export interface PageTransferState extends BlockingCause {
  sourceId: string;
  sourceCanonicalId: string;
  sourceLocator: string;
  sourceTitle: string;
  projectedParentId?: string;
  destinationId?: string;
  destinationCanonicalId?: string;
  destinationLocator?: string;
  destinationTitle: string;
  previousDestinationIds?: string[];
  sourceFingerprint?: string;
  destinationFingerprint?: string;
  destinationVersion?: string;
  status: PageTransferStatus;
  resources: Record<string, ResourceTransferState>;
  comments?: CommentTransferState;
  degradations: string[];
  adaptations?: string[];
  conflictEvidence?: ConflictEvidence;
  lastError?: string;
  updatedAt: string;
}

export interface StateGraphEdge {
  from: string;
  raw: string;
  to?: string;
  status: GraphEdgeStatus;
  message?: string;
}

export interface StateRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  scope: 'page' | 'subtree' | 'linked';
  sourceStatus: SourceStatus;
  dryRun: boolean;
  pages: number;
  returnedDescendants: number;
  selectedDescendants: number;
  excludedPages: number;
  maximumDepth: number;
  warnings: number;
  degradations?: number;
  adaptations?: number;
  normalizations?: number;
  preservedExternalReferences?: number;
  errors: number;
  rootErrors?: number;
  dependentPages?: number;
  dependentFiles?: number;
  dependentComments?: number;
  commentsEnabled?: boolean;
  commentThreads?: number;
  comments?: number;
  commentAttachments?: number;
}

export interface TransferState {
  identity: TransferIdentity;
  createdAt: string;
  updatedAt: string;
  pages: Record<string, PageTransferState>;
  graph: {rootId?: string; edges: StateGraphEdge[]};
  runs: StateRun[];
}

export interface StateLocation {
  id: string;
  mode: 'automatic' | 'explicit';
  filename: string;
  runtimeDirectory: string;
  cacheDirectory: string;
  reportsDirectory: string;
}

export type StateLoadSource = 'existing' | 'new' | 'fresh';
export interface StateLoadInfo {source: StateLoadSource; backupFilename?: string}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function canonicalIdentity(identity: TransferIdentity): unknown {
  const endpoint = (value: EndpointIdentity | DirectoryIdentity): unknown => value.provider === 'filesystem'
    ? {provider: value.provider, path: path.resolve(value.path), format: value.format}
    : {
      profile: value.profile,
      provider: value.provider,
      instance: canonicalUrl(value.instance),
      objectId: value.objectId,
      ...(value.containerId ? {containerId: value.containerId} : {}),
    };
  return {source: endpoint(identity.source), destination: endpoint(identity.destination)};
}

export function transferStateId(identity: TransferIdentity): string {
  return createHash('sha256').update(JSON.stringify(canonicalIdentity(identity))).digest('hex').slice(0, 24);
}

export function resolveStateLocation(identity: TransferIdentity, options: {stateFilename?: string; runtimeDirectory?: string} = {}): StateLocation {
  const id = transferStateId(identity);
  if (options.stateFilename !== undefined) {
    const filename = options.stateFilename.trim();
    if (!filename) throw new Error('--state must be a non-empty JSON path. Omit it to use automatic state selection.');
    const runtimeDirectory = path.dirname(filename);
    return {
      id,
      mode: 'explicit',
      filename,
      runtimeDirectory,
      cacheDirectory: path.join(runtimeDirectory, 'cache'),
      reportsDirectory: path.join(runtimeDirectory, 'reports'),
    };
  }
  const runtimeDirectory = options.runtimeDirectory ?? '.states';
  return {
    id,
    mode: 'automatic',
    filename: path.join(runtimeDirectory, `${id}.json`),
    runtimeDirectory,
    cacheDirectory: path.join(runtimeDirectory, 'cache'),
    reportsDirectory: path.join(runtimeDirectory, 'reports'),
  };
}

function emptyState(identity: TransferIdentity): TransferState {
  const now = new Date().toISOString();
  return {identity, createdAt: now, updatedAt: now, pages: {}, graph: {edges: []}, runs: []};
}

const endpointIdentitySchema = z.object({
  profile: z.string(),
  provider: z.enum(['yandex-wiki', 'confluence']),
  instance: z.url(),
  objectId: z.string(),
  containerId: z.string().optional(),
}).strict();

const directoryIdentitySchema = z.object({
  provider: z.literal('filesystem'),
  path: z.string(),
  format: z.enum(['markdown', 'html']),
}).strict();

const transferIdentitySchema = z.object({
  source: endpointIdentitySchema,
  destination: z.union([endpointIdentitySchema, directoryIdentitySchema]),
}).strict();

const resourceStateSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  destinationId: z.string().optional(),
  destinationName: z.string(),
  destinationUrl: z.string().optional(),
  sha256: z.string().optional(),
  size: z.number().nonnegative().optional(),
  cachePath: z.string().optional(),
  mimeType: z.string().optional(),
  status: z.enum(['planned', 'not-started', 'blocked', 'complete', 'partial', 'failed']),
  blockedByPageId: z.string().optional(),
  blockedByCode: z.string().optional(),
  blockedReason: z.string().optional(),
  lastError: z.string().optional(),
  updatedAt: z.string(),
}).strict();

const commentStateSchema = z.object({
  fingerprint: z.string().optional(),
  destinationId: z.string().optional(),
  destinationFingerprint: z.string().optional(),
  destinationVersion: z.string().optional(),
  destinationUrl: z.string().optional(),
  previousDestinationIds: z.array(z.string()).optional(),
  archiveResourceId: z.string().optional(),
  archiveName: z.string().optional(),
  archiveUrl: z.string().optional(),
  archivePath: z.string().optional(),
  archiveSha256: z.string().optional(),
  fullArchiveResourceId: z.string().optional(),
  fullArchiveName: z.string().optional(),
  fullArchivePath: z.string().optional(),
  fullArchiveSha256: z.string().optional(),
  status: z.enum(['planned', 'not-started', 'blocked', 'complete', 'partial', 'failed', 'conflict', 'stale', 'skipped']),
  blockedByPageId: z.string().optional(),
  blockedByCode: z.string().optional(),
  blockedReason: z.string().optional(),
  threads: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  participants: z.number().int().nonnegative(),
  attachments: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  preview: z.string().optional(),
  lastError: z.string().optional(),
  updatedAt: z.string(),
}).strict();

const pageStateSchema = z.object({
  sourceId: z.string(),
  sourceCanonicalId: z.string(),
  sourceLocator: z.string(),
  sourceTitle: z.string(),
  projectedParentId: z.string().optional(),
  destinationId: z.string().optional(),
  destinationCanonicalId: z.string().optional(),
  destinationLocator: z.string().optional(),
  destinationTitle: z.string(),
  previousDestinationIds: z.array(z.string()).optional(),
  sourceFingerprint: z.string().optional(),
  destinationFingerprint: z.string().optional(),
  destinationVersion: z.string().optional(),
  status: z.enum(['discovered', 'planned', 'skeleton-created', 'not-started', 'complete', 'partial', 'conflict', 'failed', 'blocked']),
  blockedByPageId: z.string().optional(),
  blockedByCode: z.string().optional(),
  blockedReason: z.string().optional(),
  resources: z.record(z.string(), resourceStateSchema),
  comments: commentStateSchema.optional(),
  degradations: z.array(z.string()),
  adaptations: z.array(z.string()).optional(),
  conflictEvidence: z.object({
    reason: z.enum(['duplicate-source-mapping', 'immutable-id-mismatch', 'ambiguous-ownership-candidates']),
    candidateIds: z.array(z.string()),
  }).strict().optional(),
  lastError: z.string().optional(),
  updatedAt: z.string(),
}).strict();

const graphEdgeSchema = z.object({
  from: z.string(),
  raw: z.string(),
  to: z.string().optional(),
  status: z.enum(['resolved', 'external', 'inaccessible', 'broken', 'cycle', 'unsupported']),
  message: z.string().optional(),
}).strict();

const runSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['running', 'completed', 'completed-with-warnings', 'partial', 'failed', 'cancelled', 'interrupted']),
  scope: z.enum(['page', 'subtree', 'linked']),
  sourceStatus: z.enum(['all', 'current']).optional().default('all'),
  dryRun: z.boolean(),
  pages: z.number().int().nonnegative(),
  returnedDescendants: z.number().int().nonnegative().optional().default(0),
  selectedDescendants: z.number().int().nonnegative().optional().default(0),
  excludedPages: z.number().int().nonnegative().optional().default(0),
  maximumDepth: z.number().int().nonnegative().optional().default(0),
  warnings: z.number().int().nonnegative(),
  degradations: z.number().int().nonnegative().optional(),
  adaptations: z.number().int().nonnegative().optional(),
  normalizations: z.number().int().nonnegative().optional(),
  preservedExternalReferences: z.number().int().nonnegative().optional(),
  errors: z.number().int().nonnegative(),
  rootErrors: z.number().int().nonnegative().optional(),
  dependentPages: z.number().int().nonnegative().optional(),
  dependentFiles: z.number().int().nonnegative().optional(),
  dependentComments: z.number().int().nonnegative().optional(),
  commentsEnabled: z.boolean().optional(),
  commentThreads: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  commentAttachments: z.number().int().nonnegative().optional(),
}).strict();

const transferStateSchema = z.object({
  identity: transferIdentitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  pages: z.record(z.string(), pageStateSchema),
  graph: z.object({rootId: z.string().optional(), edges: z.array(graphEdgeSchema)}).strict(),
  runs: z.array(runSchema),
}).strict();

function identityEquals(left: TransferIdentity, right: TransferIdentity): boolean {
  return JSON.stringify(canonicalIdentity(left)) === JSON.stringify(canonicalIdentity(right));
}

function help(filename: string): string {
  return `Choose a matching --state file, omit --state for automatic selection, or use --fresh to preserve "${filename}" and start clean.`;
}

async function readState(filename: string): Promise<TransferState | undefined> {
  let content: string;
  try {
    content = await readFile(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Cannot read transfer state "${filename}". ${help(filename)}`, {cause: error});
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Transfer state "${filename}" is not valid JSON. ${help(filename)}`, {cause: error});
  }
  const parsed = transferStateSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Transfer state "${filename}" is invalid. ${help(filename)}`);
  return parsed.data as TransferState;
}

function backupFilename(filename: string): string {
  return `${filename}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

export class StateStore {
  private state?: TransferState;
  private saveChain: Promise<void> = Promise.resolve();
  private readOnly = false;
  private info?: StateLoadInfo;
  private lease?: ExclusiveLease;

  constructor(public readonly filename: string) {}

  async load(identity: TransferIdentity, options: {fresh?: boolean; dryRun?: boolean} = {}): Promise<TransferState> {
    this.readOnly = options.dryRun ?? false;
    if (!this.readOnly) {
      this.lease = await acquireExclusiveLease(`${this.filename}.lock`, 'ywtc state run', this.filename);
    }
    try {
    if (options.fresh) {
      let preserved: string | undefined;
      if (!this.readOnly) {
        const backup = backupFilename(this.filename);
        try {
          const selected = await stat(this.filename);
          if (!selected.isFile()) throw new Error(`State path is not a regular file: ${this.filename}`);
          await rename(this.filename, backup);
          preserved = backup;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      this.state = emptyState(identity);
      this.info = {source: 'fresh', ...(preserved ? {backupFilename: preserved} : {})};
      return this.state;
    }
    const selected = await readState(this.filename);
    if (selected) {
      if (!identityEquals(selected.identity, identity)) {
        throw new Error(`Transfer state "${this.filename}" belongs to another canonical source/destination pair. ${help(this.filename)}`);
      }
      for (const run of selected.runs) {
        if (run.status === 'running') {
          run.status = 'interrupted';
          run.finishedAt = new Date().toISOString();
        }
      }
      this.state = selected;
      this.info = {source: 'existing'};
      return selected;
    }
    this.state = emptyState(identity);
    this.info = {source: 'new'};
    return this.state;
    } catch (error) {
      await this.release();
      throw error;
    }
  }

  get value(): TransferState {
    if (!this.state) throw new Error('StateStore.load() must be called before accessing state');
    return this.state;
  }

  get loadInfo(): StateLoadInfo {
    if (!this.info) throw new Error('StateStore.load() must be called before accessing load information');
    return this.info;
  }

  async beginRun(scope: StateRun['scope'], dryRun: boolean, sourceStatus: SourceStatus = 'all', commentsEnabled = true): Promise<StateRun> {
    const run: StateRun = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      status: 'running',
      scope,
      sourceStatus,
      dryRun,
      pages: 0,
      returnedDescendants: 0,
      selectedDescendants: 0,
      excludedPages: 0,
      maximumDepth: 0,
      warnings: 0,
      errors: 0,
      commentsEnabled,
      commentThreads: 0,
      comments: 0,
      commentAttachments: 0,
    };
    this.value.runs.push(run);
    if (!dryRun) await this.save();
    return run;
  }

  async setRunComments(runId: string, counts: {threads: number; comments: number; attachments: number}): Promise<void> {
    const run = this.value.runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`State run ${runId} was not initialized`);
    run.commentThreads = counts.threads;
    run.comments = counts.comments;
    run.commentAttachments = counts.attachments;
    if (!this.readOnly) await this.save();
  }

  async setRunSelection(runId: string, selection: SourceSelection): Promise<void> {
    const run = this.value.runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`State run ${runId} was not initialized`);
    Object.assign(run, {
      sourceStatus: selection.effectiveStatus,
      returnedDescendants: selection.returnedDescendants,
      selectedDescendants: selection.selectedDescendants,
      excludedPages: selection.excluded.length,
      maximumDepth: selection.maximumDepth,
    });
    if (!this.readOnly) await this.save();
  }

  async finishRun(runId: string, status: RunStatus, counts: {
    pages: number;
    warnings: number;
    degradations?: number;
    adaptations?: number;
    normalizations?: number;
    preservedExternalReferences?: number;
    errors: number;
    rootErrors?: number;
    dependentPages?: number;
    dependentFiles?: number;
    dependentComments?: number;
  }): Promise<void> {
    const run = this.value.runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`State run ${runId} was not initialized`);
    Object.assign(run, counts, {status, finishedAt: new Date().toISOString()});
    if (!this.readOnly) await this.save();
    await this.release();
  }

  async release(): Promise<void> {
    const lease = this.lease;
    delete this.lease;
    await lease?.release();
  }

  async setGraph(rootId: string, edges: StateGraphEdge[]): Promise<void> {
    this.value.graph = {rootId, edges};
    if (!this.readOnly) await this.save();
  }

  async setPage(page: PageTransferState): Promise<void> {
    this.value.pages[page.sourceCanonicalId] = page;
    if (!this.readOnly) await this.save();
  }

  async finalizeOutcomes(pageIds: string[], status: RunStatus, dryRun: boolean): Promise<void> {
    if (dryRun || this.readOnly) return;
    const interrupted = status === 'cancelled' || status === 'interrupted';
    const updatedAt = new Date().toISOString();
    for (const pageId of pageIds) {
      const page = this.value.pages[pageId];
      if (!page) continue;
      if (['discovered', 'planned', 'skeleton-created'].includes(page.status)) page.status = 'not-started';
      const dependencyBlocked = page.status === 'blocked' || page.status === 'failed' || page.status === 'conflict';
      const blockedByPageId = page.blockedByPageId ?? page.sourceCanonicalId;
      const blockedByCode = page.blockedByCode ?? (page.status === 'conflict' ? 'destination-ownership-ambiguity' : 'destination-page-unavailable');
      const blockedReason = page.blockedReason ?? page.lastError ?? `Destination page ${blockedByPageId} is unavailable`;
      for (const resource of Object.values(page.resources)) {
        if (resource.status !== 'planned') continue;
        if (dependencyBlocked) Object.assign(resource, {status: 'blocked', blockedByPageId, blockedByCode, blockedReason, lastError: blockedReason});
        else Object.assign(resource, {status: 'not-started', lastError: interrupted ? 'Transfer was interrupted before this file operation started' : 'Transfer ended before this file operation started'});
        resource.updatedAt = updatedAt;
      }
      if (page.comments?.status === 'planned') {
        if (dependencyBlocked) Object.assign(page.comments, {status: 'blocked', blockedByPageId, blockedByCode, blockedReason, lastError: blockedReason});
        else Object.assign(page.comments, {status: 'not-started', lastError: interrupted ? 'Transfer was interrupted before comment archival started' : 'Transfer ended before comment archival started'});
        page.comments.updatedAt = updatedAt;
      }
      page.updatedAt = updatedAt;
    }
    await this.save();
  }

  async save(): Promise<void> {
    if (this.readOnly) throw new Error(`Refusing to write transfer state "${this.filename}" during --dry-run.`);
    const write = this.saveChain.catch(() => undefined).then(async () => {
      this.value.updatedAt = new Date().toISOString();
      const temporary = `${this.filename}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
      await mkdir(path.dirname(this.filename), {recursive: true, mode: 0o700});
      await writeFile(temporary, `${JSON.stringify(this.value, null, 2)}\n`, {mode: 0o600});
      await rename(temporary, this.filename);
    });
    this.saveChain = write;
    await write;
  }
}
