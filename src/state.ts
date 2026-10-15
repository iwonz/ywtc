import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {ExportFormat, GraphEdgeStatus, ProviderKind, SourceSelection, SourceStatus} from './domain.js';

export type PageTransferStatus = 'discovered' | 'planned' | 'skeleton-created' | 'complete' | 'partial' | 'conflict' | 'failed' | 'blocked';
export type RunStatus = 'running' | 'completed' | 'completed-with-warnings' | 'partial' | 'failed' | 'cancelled' | 'interrupted';

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

export interface ResourceTransferState {
  sourceId: string;
  sourceName: string;
  destinationId?: string;
  destinationName: string;
  sha256?: string;
  size?: number;
  cachePath?: string;
  mimeType?: string;
  status: 'planned' | 'complete' | 'partial' | 'failed';
  lastError?: string;
  updatedAt: string;
}

export interface PageTransferState {
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
  status: PageTransferStatus;
  resources: Record<string, ResourceTransferState>;
  degradations: string[];
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
  errors: number;
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
  sha256: z.string().optional(),
  size: z.number().nonnegative().optional(),
  cachePath: z.string().optional(),
  mimeType: z.string().optional(),
  status: z.enum(['planned', 'complete', 'partial', 'failed']),
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
  status: z.enum(['discovered', 'planned', 'skeleton-created', 'complete', 'partial', 'conflict', 'failed', 'blocked']),
  resources: z.record(z.string(), resourceStateSchema),
  degradations: z.array(z.string()),
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
  errors: z.number().int().nonnegative(),
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

  constructor(public readonly filename: string) {}

  async load(identity: TransferIdentity, options: {fresh?: boolean; dryRun?: boolean} = {}): Promise<TransferState> {
    this.readOnly = options.dryRun ?? false;
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
  }

  get value(): TransferState {
    if (!this.state) throw new Error('StateStore.load() must be called before accessing state');
    return this.state;
  }

  get loadInfo(): StateLoadInfo {
    if (!this.info) throw new Error('StateStore.load() must be called before accessing load information');
    return this.info;
  }

  async beginRun(scope: StateRun['scope'], dryRun: boolean, sourceStatus: SourceStatus = 'all'): Promise<StateRun> {
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
    };
    this.value.runs.push(run);
    if (!dryRun) await this.save();
    return run;
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

  async finishRun(runId: string, status: RunStatus, counts: {pages: number; warnings: number; errors: number}): Promise<void> {
    const run = this.value.runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`State run ${runId} was not initialized`);
    Object.assign(run, counts, {status, finishedAt: new Date().toISOString()});
    if (!this.readOnly) await this.save();
  }

  async setGraph(rootId: string, edges: StateGraphEdge[]): Promise<void> {
    this.value.graph = {rootId, edges};
    if (!this.readOnly) await this.save();
  }

  async setPage(page: PageTransferState): Promise<void> {
    this.value.pages[page.sourceCanonicalId] = page;
    if (!this.readOnly) await this.save();
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
