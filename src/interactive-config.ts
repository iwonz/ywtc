import {createHash, randomUUID} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Document, isMap, isScalar, parseDocument} from 'yaml';
import {
  type AppConfig,
  type ConfluenceConnectionProfile,
  parseWorkspaceConfig,
  parseWorkspaceConfigYaml,
  type YandexConnectionProfile,
} from './config.js';
import {ensureWorkspaceDirectories, type Workspace} from './workspace.js';

const YANDEX_LIMITS = {
  readConcurrency: 4,
  writeConcurrency: 2,
  downloadConcurrency: 2,
  uploadConcurrency: 2,
  requestsPerSecond: 8,
  burst: 8,
};

const CONFLUENCE_LIMITS = {...YANDEX_LIMITS, burst: 10};

export interface ExistingInteractiveConfig {
  source: string;
  fingerprint: string;
  mode: number;
  document?: Document;
  config?: AppConfig;
  error?: string;
}

export interface InteractiveCommitResult {
  configFile: string;
  backupFile?: string;
}

export interface InteractiveFileOperations {
  rename: typeof fs.rename;
  unlink: typeof fs.unlink;
}

export class InteractiveConfigConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteractiveConfigConflictError';
  }
}

function fingerprint(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function profileObject(profile: YandexConnectionProfile | ConfluenceConnectionProfile): Record<string, unknown> {
  if (profile.type === 'yandex-wiki') {
    return {
      type: profile.type,
      apiUrl: profile.apiUrl,
      webUrl: profile.webUrl,
      authType: profile.authType,
      token: profile.token,
      organization: profile.organization,
      limits: profile.limits,
    };
  }
  return {
    type: profile.type,
    deployment: profile.deployment,
    baseUrl: profile.baseUrl,
    authType: profile.authType,
    token: profile.token,
    ...(profile.email !== undefined ? {email: profile.email} : {}),
    limits: profile.limits,
  };
}

export function defaultYandexProfile(name = 'yandex'): YandexConnectionProfile {
  return {
    name,
    type: 'yandex-wiki',
    apiUrl: 'https://api.wiki.yandex.net/v1',
    webUrl: 'https://wiki.yandex.ru',
    authType: 'oauth',
    token: '',
    organization: {type: 'yandex360', id: ''},
    limits: {...YANDEX_LIMITS},
  };
}

export function defaultConfluenceProfile(name = 'confluence'): ConfluenceConnectionProfile {
  return {
    name,
    type: 'confluence',
    deployment: 'data-center',
    baseUrl: '',
    authType: 'pat',
    token: '',
    limits: {...CONFLUENCE_LIMITS},
  };
}

export function createInteractiveConfigDocument(): Document {
  return new Document({
    defaults: {timeoutMs: 30_000, concurrency: 4},
    connections: {},
  });
}

function setProfileScalars(
  document: Document,
  previousName: string | undefined,
  profile: YandexConnectionProfile | ConfluenceConnectionProfile,
): void {
  const base = ['connections', profile.name];
  let sameProfile = previousName === profile.name && document.hasIn(base);
  if (previousName && previousName !== profile.name) {
    const connections = document.getIn(['connections'], true);
    const existing = isMap(connections)
      ? connections.items.find((item) => isScalar(item.key) && item.key.value === previousName)
      : undefined;
    if (existing && isScalar(existing.key)) {
      existing.key.value = profile.name;
      sameProfile = true;
    } else {
      document.deleteIn(['connections', previousName]);
    }
  }
  if (!sameProfile) {
    document.setIn(base, profileObject(profile));
    return;
  }

  document.setIn([...base, 'type'], profile.type);
  document.setIn([...base, 'token'], profile.token);
  if (profile.type === 'yandex-wiki') {
    document.setIn([...base, 'apiUrl'], profile.apiUrl);
    document.setIn([...base, 'webUrl'], profile.webUrl);
    document.setIn([...base, 'authType'], profile.authType);
    document.setIn([...base, 'organization', 'type'], profile.organization.type);
    document.setIn([...base, 'organization', 'id'], profile.organization.id);
    for (const key of ['deployment', 'baseUrl', 'email']) document.deleteIn([...base, key]);
  } else {
    document.setIn([...base, 'deployment'], profile.deployment);
    document.setIn([...base, 'baseUrl'], profile.baseUrl);
    document.setIn([...base, 'authType'], profile.authType);
    if (profile.email !== undefined) document.setIn([...base, 'email'], profile.email);
    else document.deleteIn([...base, 'email']);
    for (const key of ['apiUrl', 'webUrl', 'organization']) document.deleteIn([...base, key]);
  }
}

export function updateInteractiveProfile(
  document: Document,
  previousName: string | undefined,
  profile: YandexConnectionProfile | ConfluenceConnectionProfile,
): void {
  setProfileScalars(document, previousName, profile);
}

export function validateInteractiveDocument(document: Document, configFile: string): AppConfig {
  if (document.errors.length > 0) throw new Error(`Cannot parse workspace configuration: ${configFile}`);
  return parseWorkspaceConfig(document.toJS(), configFile);
}

export async function readExistingInteractiveConfig(workspace: Workspace): Promise<ExistingInteractiveConfig | undefined> {
  let source: string;
  let mode: number;
  try {
    [source, mode] = await Promise.all([
      fs.readFile(workspace.configFile, 'utf8'),
      fs.stat(workspace.configFile).then((value) => value.mode & 0o777),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  const base = {source, fingerprint: fingerprint(source), mode};
  try {
    const document = parseDocument(source);
    const config = validateInteractiveDocument(document, workspace.configFile);
    return {...base, document, config};
  } catch (error) {
    return {...base, error: error instanceof Error ? error.message : String(error)};
  }
}

function serialized(document: Document): string {
  const value = document.toString({lineWidth: 0});
  return value.endsWith('\n') ? value : `${value}\n`;
}

function backupTimestamp(now: Date): string {
  return now.toISOString().replaceAll(/[-:]/g, '').replace('.', '-').replace('Z', 'Z');
}

async function unchanged(workspace: Workspace, original: ExistingInteractiveConfig | undefined): Promise<boolean> {
  try {
    const current = await fs.readFile(workspace.configFile, 'utf8');
    return original !== undefined && fingerprint(current) === original.fingerprint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return original === undefined;
    throw error;
  }
}

interface SemanticChange {
  path: string[];
  before: unknown;
  after: unknown;
}

function recordSemanticChanges(before: unknown, after: unknown, currentPath: string[] = []): SemanticChange[] {
  if (isDeepStrictEqual(before, after)) return [];
  const beforeRecord = before && typeof before === 'object' && !Array.isArray(before) ? before as Record<string, unknown> : undefined;
  const afterRecord = after && typeof after === 'object' && !Array.isArray(after) ? after as Record<string, unknown> : undefined;
  if (beforeRecord && afterRecord) {
    return [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])]
      .flatMap((key) => recordSemanticChanges(beforeRecord[key], afterRecord[key], [...currentPath, key]));
  }
  return [{path: currentPath, before, after}];
}

function valueAt(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

async function mergeCurrentInteractiveChanges(
  workspace: Workspace,
  original: ExistingInteractiveConfig,
  draft: Document,
): Promise<Document> {
  if (!original.document) {
    throw new InteractiveConfigConflictError(`Configuration changed during setup and its original fields cannot be merged: ${workspace.configFile}.`);
  }
  const latestSource = await fs.readFile(workspace.configFile, 'utf8');
  const latest = parseDocument(latestSource);
  validateInteractiveDocument(latest, workspace.configFile);
  const before = original.document.toJS();
  const after = draft.toJS();
  const current = latest.toJS();
  const changes = recordSemanticChanges(before, after);
  const conflicting = changes.filter((change) => {
    const latestValue = valueAt(current, change.path);
    return !isDeepStrictEqual(latestValue, change.before) && !isDeepStrictEqual(latestValue, change.after);
  });
  if (conflicting.length > 0) {
    throw new InteractiveConfigConflictError(
      `Configuration fields changed both in the wizard and on disk: ${conflicting.map((change) => change.path.join('.')).join(', ')}. Review those fields and retry.`,
    );
  }
  for (const change of changes) {
    if (change.after === undefined) latest.deleteIn(change.path);
    else latest.setIn(change.path, change.after);
  }
  validateInteractiveDocument(latest, workspace.configFile);
  return latest;
}

async function replaceConfig(tempFile: string, workspace: Workspace, operations: InteractiveFileOperations): Promise<void> {
  try {
    await operations.rename(tempFile, workspace.configFile);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    const rollback = path.join(workspace.statesDirectory, `.config-rollback-${randomUUID()}.yaml`);
    await operations.rename(workspace.configFile, rollback);
    try {
      await operations.rename(tempFile, workspace.configFile);
      await operations.unlink(rollback);
    } catch (replacementError) {
      await operations.rename(rollback, workspace.configFile);
      throw replacementError;
    }
  }
}

export async function commitInteractiveConfig(input: {
  workspace: Workspace;
  document: Document;
  original?: ExistingInteractiveConfig;
  reset: boolean;
  now?: Date;
  operations?: InteractiveFileOperations;
}): Promise<InteractiveCommitResult> {
  const {workspace, document, original, reset} = input;
  let committedDocument = document;
  if (!await unchanged(workspace, original)) {
    if (reset || !original) {
      throw new InteractiveConfigConflictError(`Configuration changed during setup: ${workspace.configFile}. Review it and retry.`);
    }
    committedDocument = await mergeCurrentInteractiveChanges(workspace, original, document);
  }
  const source = serialized(committedDocument);
  parseWorkspaceConfigYaml(source, workspace.configFile);

  await ensureWorkspaceDirectories(workspace);
  let backupFile: string | undefined;
  if (reset && original) {
    const backups = path.join(workspace.statesDirectory, 'backups');
    await fs.mkdir(backups, {recursive: true, mode: 0o700});
    backupFile = path.join(backups, `ywtc.config.${backupTimestamp(input.now ?? new Date())}.${randomUUID().slice(0, 8)}.backup.yaml`);
    await fs.writeFile(backupFile, original.source, {encoding: 'utf8', flag: 'wx', mode: 0o600});
  }

  const tempFile = path.join(workspace.statesDirectory, `.config-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempFile, source, {encoding: 'utf8', flag: 'wx', mode: 0o600});
    if (original) await fs.chmod(tempFile, original.mode);
    parseWorkspaceConfigYaml(await fs.readFile(tempFile, 'utf8'), workspace.configFile);
    const handle = await fs.open(tempFile, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceConfig(tempFile, workspace, input.operations ?? fs);
  } finally {
    await (input.operations ?? fs).unlink(tempFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return {configFile: workspace.configFile, ...(backupFile ? {backupFile} : {})};
}
