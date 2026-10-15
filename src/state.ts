import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ExportFormat, GraphEdgeStatus, ProviderKind} from './domain.js';

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
  dryRun: boolean;
  pages: number;
  warnings: number;
  errors: number;
}

export interface TransferState {
  version: 2;
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
  return {schema: 'ywtc-state-v2', source: endpoint(identity.source), destination: endpoint(identity.destination)};
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
  return {version: 2, identity, createdAt: now, updatedAt: now, pages: {}, graph: {edges: []}, runs: []};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identityEquals(left: TransferIdentity, right: TransferIdentity): boolean {
  return JSON.stringify(canonicalIdentity(left)) === JSON.stringify(canonicalIdentity(right));
}

function help(filename: string): string {
  return `Restore a v2 backup, choose a matching --state file, omit --state for automatic selection, or use --fresh to preserve "${filename}" and start clean.`;
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
  if (isRecord(value) && value.version === 1) {
    throw new Error(`Transfer state "${filename}" uses unsupported schema v1. It was preserved unchanged. Use a new workdir/state or --fresh; automatic conversion could duplicate remote content.`);
  }
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.identity) || !isRecord(value.pages) || !isRecord(value.graph) || !Array.isArray(value.runs)) {
    throw new Error(`Transfer state "${filename}" has an unsupported or incomplete schema. ${help(filename)}`);
  }
  return value as unknown as TransferState;
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

  async beginRun(scope: StateRun['scope'], dryRun: boolean): Promise<StateRun> {
    const run: StateRun = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      status: 'running',
      scope,
      dryRun,
      pages: 0,
      warnings: 0,
      errors: 0,
    };
    this.value.runs.push(run);
    if (!dryRun) await this.save();
    return run;
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
