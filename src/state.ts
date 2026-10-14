import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {MigrationState, PageState} from './types.js';

export interface StateIdentity {
  sourceRootSlug: string;
  targetPageId: string;
  spaceKey: string;
}

export interface CanonicalMigrationIdentity {
  yandexApiUrl: string;
  yandexWebUrl: string;
  yandexOrgId: string;
  yandexOrgType: 'yandex360' | 'cloud';
  sourcePageId: number;
  confluenceBaseUrl: string;
  targetPageId: string;
  spaceKey: string;
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

export interface StateLoadInfo {
  source: StateLoadSource;
  backupFilename?: string;
}

export interface StateLoadOptions {
  fresh?: boolean;
  dryRun?: boolean;
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function migrationStateId(identity: CanonicalMigrationIdentity): string {
  const canonical = [
    'ywtc-state-v1',
    normalizedUrl(identity.yandexApiUrl),
    normalizedUrl(identity.yandexWebUrl),
    identity.yandexOrgType,
    identity.yandexOrgId.trim(),
    String(identity.sourcePageId),
    normalizedUrl(identity.confluenceBaseUrl),
    identity.spaceKey,
    identity.targetPageId,
  ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 24);
}

export function resolveStateLocation(
  identity: CanonicalMigrationIdentity,
  options: {stateFilename?: string; runtimeDirectory?: string} = {},
): StateLocation {
  const id = migrationStateId(identity);
  if (options.stateFilename !== undefined) {
    const filename = options.stateFilename.trim();
    if (!filename) {
      throw new Error('--state must be a non-empty file path. Omit --state to use automatic state selection.');
    }
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

function emptyState(identity: StateIdentity): MigrationState {
  const now = new Date().toISOString();
  return {
    version: 1,
    ...identity,
    startedAt: now,
    updatedAt: now,
    pages: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function belongsTo(state: MigrationState, identity: StateIdentity): boolean {
  return state.sourceRootSlug === identity.sourceRootSlug
    && state.targetPageId === identity.targetPageId
    && state.spaceKey === identity.spaceKey;
}

function stateHelp(filename: string): string {
  return `Restore a valid backup, pass a matching file with --state, omit --state for automatic selection, or use --fresh to preserve "${filename}" as a backup and start clean.`;
}

async function readStateFile(filename: string): Promise<MigrationState | undefined> {
  let content: string;
  try {
    content = await readFile(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(
      `Cannot read migration state "${filename}". Check that the file is readable and its parent directory is accessible. ${stateHelp(filename)}`,
      {cause: error},
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Migration state "${filename}" is not valid JSON. ${stateHelp(filename)}`, {cause: error});
  }
  if (
    !isRecord(parsed)
    || parsed.version !== 1
    || typeof parsed.sourceRootSlug !== 'string'
    || typeof parsed.targetPageId !== 'string'
    || typeof parsed.spaceKey !== 'string'
    || typeof parsed.startedAt !== 'string'
    || typeof parsed.updatedAt !== 'string'
    || !isRecord(parsed.pages)
  ) {
    throw new Error(`Migration state "${filename}" has an unsupported or incomplete schema. ${stateHelp(filename)}`);
  }
  return parsed as unknown as MigrationState;
}

function ownershipError(filename: string, state: MigrationState, identity: StateIdentity): Error {
  return new Error(
    `Migration state "${filename}" belongs to source "${state.sourceRootSlug}", target page "${state.targetPageId}", space "${state.spaceKey}", `
    + `but this run resolved source "${identity.sourceRootSlug}", target page "${identity.targetPageId}", space "${identity.spaceKey}". ${stateHelp(filename)}`,
  );
}

function backupFilename(filename: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${filename}.backup-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export class StateStore {
  private state?: MigrationState;
  private saveChain: Promise<void> = Promise.resolve();
  private readOnly = false;
  private info?: StateLoadInfo;

  constructor(public readonly filename: string) {}

  async load(identity: StateIdentity, options: StateLoadOptions = {}): Promise<MigrationState> {
    this.readOnly = options.dryRun ?? false;

    if (options.fresh) {
      let preservedFilename: string | undefined;
      if (!this.readOnly) {
        const candidate = backupFilename(this.filename);
        try {
          const selected = await stat(this.filename);
          if (!selected.isFile()) {
            throw new Error(
              `Migration state path "${this.filename}" is not a regular file. Choose a JSON file path with --state or omit --state for automatic selection.`,
            );
          }
          await rename(this.filename, candidate);
          preservedFilename = candidate;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            if (error instanceof Error && error.message.startsWith('Migration state path')) throw error;
            throw new Error(
              `Cannot preserve existing migration state "${this.filename}" as "${candidate}". Check file permissions or choose another --state path; no destination changes were made.`,
              {cause: error},
            );
          }
        }
      }
      this.state = emptyState(identity);
      this.info = {source: 'fresh', ...(preservedFilename ? {backupFilename: preservedFilename} : {})};
      return this.state;
    }

    const selected = await readStateFile(this.filename);
    if (selected) {
      if (!belongsTo(selected, identity)) throw ownershipError(this.filename, selected, identity);
      this.state = selected;
      this.info = {source: 'existing'};
      return selected;
    }

    this.state = emptyState(identity);
    this.info = {source: 'new'};
    return this.state;
  }

  get value(): MigrationState {
    if (!this.state) throw new Error('StateStore.load() must be called before accessing state');
    return this.state;
  }

  get loadInfo(): StateLoadInfo {
    if (!this.info) throw new Error('StateStore.load() must be called before accessing load information');
    return this.info;
  }

  async setPage(page: PageState): Promise<void> {
    this.value.pages[String(page.sourceId)] = page;
    await this.save();
  }

  async save(): Promise<void> {
    if (this.readOnly) {
      throw new Error(`Refusing to write migration state "${this.filename}" during --dry-run.`);
    }
    const write = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        const state = this.value;
        state.updatedAt = new Date().toISOString();
        const temporary = `${this.filename}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
        try {
          await mkdir(path.dirname(this.filename), {recursive: true});
          await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
          await rename(temporary, this.filename);
        } catch (error) {
          throw new Error(
            `Cannot atomically write migration state "${this.filename}". Check free space and directory permissions, then rerun with the same state.`,
            {cause: error},
          );
        }
      });
    this.saveChain = write;
    await write;
  }
}
