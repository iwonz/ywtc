import {constants} from 'node:fs';
import {access, chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const WORKSPACE_MARKER = '.ywtc-workspace.json';
export const WORKSPACE_ENV = '.env';
export const WORKSPACE_STATES = '.states';

export const ENV_TEMPLATE = `# Yandex Wiki Public API v1
YANDEX_WIKI_TOKEN=
YANDEX_WIKI_AUTH_TYPE=oauth
YANDEX_WIKI_ORG_ID=
YANDEX_WIKI_ORG_TYPE=yandex360
YANDEX_WIKI_API_URL=https://api.wiki.yandex.net/v1
YANDEX_WIKI_WEB_URL=https://wiki.yandex.ru

# Confluence: data-center + pat, or cloud + api-token
CONFLUENCE_DEPLOYMENT=data-center
CONFLUENCE_AUTH_TYPE=pat
CONFLUENCE_BASE_URL=
CONFLUENCE_TOKEN=
CONFLUENCE_EMAIL=

HTTP_TIMEOUT_MS=30000
MIGRATION_CONCURRENCY=4
YANDEX_API_CONCURRENCY=4
YANDEX_DOWNLOAD_CONCURRENCY=2
YANDEX_API_RPS=8
YANDEX_API_BURST=8
CONFLUENCE_READ_CONCURRENCY=4
CONFLUENCE_WRITE_CONCURRENCY=2
CONFLUENCE_UPLOAD_CONCURRENCY=2
CONFLUENCE_API_RPS=8
CONFLUENCE_API_BURST=10
`;

export interface Workspace {
  root: string;
  marker: string;
  envFile: string;
  statesDirectory: string;
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
  return {
    root,
    marker: path.join(root, WORKSPACE_MARKER),
    envFile: path.join(root, WORKSPACE_ENV),
    statesDirectory: path.join(root, WORKSPACE_STATES),
    source,
  };
}

export async function resolveWorkspace(options: {
  explicit?: string;
  cwd?: string;
  homeDirectory?: string;
} = {}): Promise<Workspace> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const homeDirectory = path.resolve(options.homeDirectory ?? os.homedir());
  if (options.explicit) {
    return workspaceAt(path.resolve(cwd, expandHome(options.explicit, homeDirectory)), 'explicit');
  }
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
  const markerCreated = await createExclusive(workspace.marker, `${JSON.stringify({schemaVersion: 1, tool: 'ywtc'}, null, 2)}\n`, 0o600);
  (markerCreated ? created : existing).push(workspace.marker);
  const envCreated = await createExclusive(workspace.envFile, ENV_TEMPLATE, 0o600);
  (envCreated ? created : existing).push(workspace.envFile);
  if (envCreated) await chmod(workspace.envFile, 0o600);
  const statesExisted = await exists(workspace.statesDirectory);
  await mkdir(workspace.statesDirectory, {recursive: true, mode: 0o700});
  (statesExisted ? existing : created).push(workspace.statesDirectory);
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
    if (value.schemaVersion !== 1 || value.tool !== 'ywtc') throw new Error('unsupported marker');
  } catch (error) {
    throw new Error(`Workspace marker is invalid: ${workspace.marker}. Run "ywtc init --workdir ${workspace.root}" after repairing it.`, {cause: error});
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
