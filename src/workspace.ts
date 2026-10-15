import {constants} from 'node:fs';
import {access, chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const WORKSPACE_MARKER = '.ywtc-workspace.json';
export const WORKSPACE_ENV = '.env';
export const WORKSPACE_CONFIG = 'ywtc.config.yaml';
export const WORKSPACE_STATES = '.states';

export const ENV_TEMPLATE = `# Secrets referenced by ywtc.config.yaml
YANDEX_WIKI_TOKEN=
CONFLUENCE_TOKEN=
CONFLUENCE_EMAIL=

# Optional global overrides
HTTP_TIMEOUT_MS=30000
MIGRATION_CONCURRENCY=4
`;

export const CONFIG_TEMPLATE = `schemaVersion: 2

defaults:
  timeoutMs: 30000
  concurrency: 4

connections:
  yandex:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    tokenEnv: YANDEX_WIKI_TOKEN
    organization:
      type: yandex360
      id: ""
    limits:
      readConcurrency: 4
      writeConcurrency: 2
      downloadConcurrency: 2
      uploadConcurrency: 2
      requestsPerSecond: 8
      burst: 8

  confluence:
    type: confluence
    deployment: data-center
    baseUrl: https://confluence.example.com/confluence
    authType: pat
    tokenEnv: CONFLUENCE_TOKEN
    limits:
      readConcurrency: 4
      writeConcurrency: 2
      downloadConcurrency: 2
      uploadConcurrency: 2
      requestsPerSecond: 8
      burst: 10
`;

export interface Workspace {
  root: string;
  marker: string;
  envFile: string;
  configFile: string;
  statesDirectory: string;
  cacheDirectory: string;
  reportsDirectory: string;
  source: 'explicit' | 'current' | 'default';
}

export interface WorkspaceInitialization {
  workspace: Workspace;
  created: string[];
  existing: string[];
}

function expandHome(value: string, homeDirectory: string): string {
  if (value === '~') return homeDirectory;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homeDirectory, value.slice(2));
  if (value.startsWith('~')) throw new Error('--workdir supports only "~" or "~/...", not another user home.');
  return value;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await access(filename, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function workspaceAt(root: string, source: Workspace['source']): Workspace {
  const statesDirectory = path.join(root, WORKSPACE_STATES);
  return {
    root,
    marker: path.join(root, WORKSPACE_MARKER),
    envFile: path.join(root, WORKSPACE_ENV),
    configFile: path.join(root, WORKSPACE_CONFIG),
    statesDirectory,
    cacheDirectory: path.join(statesDirectory, 'cache'),
    reportsDirectory: path.join(statesDirectory, 'reports'),
    source,
  };
}

export async function resolveWorkspace(options: {explicit?: string; cwd?: string; homeDirectory?: string} = {}): Promise<Workspace> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const homeDirectory = path.resolve(options.homeDirectory ?? os.homedir());
  if (options.explicit) return workspaceAt(path.resolve(cwd, expandHome(options.explicit, homeDirectory)), 'explicit');
  if (await exists(path.join(cwd, WORKSPACE_MARKER))) return workspaceAt(cwd, 'current');
  return workspaceAt(path.join(homeDirectory, '.ywtc'), 'default');
}

async function createExclusive(filename: string, content: string, mode: number): Promise<boolean> {
  try {
    await writeFile(filename, content, {encoding: 'utf8', flag: 'wx', mode});
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

export async function initializeWorkspace(workspace: Workspace): Promise<WorkspaceInitialization> {
  const created: string[] = [];
  const existing: string[] = [];
  await mkdir(workspace.root, {recursive: true, mode: 0o700});
  const artifacts: Array<[string, string, number]> = [
    [workspace.marker, `${JSON.stringify({schemaVersion: 2, tool: 'ywtc'}, null, 2)}\n`, 0o600],
    [workspace.envFile, ENV_TEMPLATE, 0o600],
    [workspace.configFile, CONFIG_TEMPLATE, 0o600],
  ];
  for (const [filename, content, mode] of artifacts) {
    const artifactCreated = await createExclusive(filename, content, mode);
    (artifactCreated ? created : existing).push(filename);
    if (artifactCreated) await chmod(filename, mode);
  }
  for (const directory of [workspace.statesDirectory, workspace.cacheDirectory, workspace.reportsDirectory]) {
    const existed = await exists(directory);
    await mkdir(directory, {recursive: true, mode: 0o700});
    (existed ? existing : created).push(directory);
  }
  return {workspace, created, existing};
}

export async function validateWorkspaceMarker(workspace: Workspace): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(workspace.marker, 'utf8');
  } catch (error) {
    throw new Error(`Workspace marker is missing or unreadable: ${workspace.marker}`, {cause: error});
  }
  try {
    const value = JSON.parse(raw) as {schemaVersion?: unknown; tool?: unknown};
    if (value.schemaVersion === 1) {
      throw new Error('schema v1 is not supported; create ywtc.config.yaml and a schema v2 marker or use a new workdir');
    }
    if (value.schemaVersion !== 2 || value.tool !== 'ywtc') throw new Error('unsupported marker');
  } catch (error) {
    throw new Error(`Workspace marker is invalid: ${workspace.marker}. ${error instanceof Error ? error.message : 'Run ywtc init after repairing it.'}`, {cause: error});
  }
}

export function resolveWorkspacePath(workspace: Workspace, value: string): string {
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspace.root, value);
  const relative = path.relative(workspace.root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path must remain inside workdir ${workspace.root}: ${value}`);
  }
  return candidate;
}
