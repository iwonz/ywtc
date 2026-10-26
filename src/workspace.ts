import {constants} from 'node:fs';
import {access, mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const WORKSPACE_CONFIG = 'ywtc.config.yaml';
export const WORKSPACE_STATES = '.states';

export const CONFIG_TEMPLATE = `defaults:
  timeoutMs: 30000
  concurrency: 4

mentions:
  mode: off
  # Use mode: mapping and mappingFile: ./mentions/decisions.json for explicit decisions.

hashtags:
  mode: off
  # Use mode: mapping and mappingFile: ./hashtags/decisions.json for explicit decisions.

connections:
  yandex:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    token: ""
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
    token: ""
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

export interface WorkspaceDirectories {
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

export async function workspaceIsInitialized(workspace: Workspace): Promise<boolean> {
  return exists(workspace.configFile);
}

function workspaceAt(root: string, source: Workspace['source']): Workspace {
  const statesDirectory = path.join(root, WORKSPACE_STATES);
  return {
    root,
    configFile: path.join(root, WORKSPACE_CONFIG),
    statesDirectory,
    cacheDirectory: path.join(statesDirectory, 'cache'),
    reportsDirectory: path.join(statesDirectory, 'reports'),
    source,
  };
}

function normalizedExplicitRoot(explicit: string, cwd: string, homeDirectory: string): string {
  return path.resolve(cwd, expandHome(explicit, homeDirectory));
}

export async function resolveWorkspace(options: {explicit?: string; cwd?: string; homeDirectory?: string} = {}): Promise<Workspace> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const homeDirectory = path.resolve(options.homeDirectory ?? os.homedir());
  if (options.explicit) return workspaceAt(normalizedExplicitRoot(options.explicit, cwd, homeDirectory), 'explicit');
  if (await exists(path.join(cwd, WORKSPACE_CONFIG))) return workspaceAt(cwd, 'current');
  return workspaceAt(path.join(homeDirectory, '.ywtc'), 'default');
}

export function resolveInitWorkspace(options: {explicit?: string; cwd?: string; homeDirectory?: string} = {}): Workspace {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const homeDirectory = path.resolve(options.homeDirectory ?? os.homedir());
  if (options.explicit) return workspaceAt(normalizedExplicitRoot(options.explicit, cwd, homeDirectory), 'explicit');
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
  const configCreated = await createExclusive(workspace.configFile, CONFIG_TEMPLATE, 0o600);
  (configCreated ? created : existing).push(workspace.configFile);
  const directories = await ensureWorkspaceDirectories(workspace);
  created.push(...directories.created);
  existing.push(...directories.existing);
  return {workspace, created, existing};
}

export async function ensureWorkspaceDirectories(workspace: Workspace): Promise<WorkspaceDirectories> {
  const created: string[] = [];
  const existing: string[] = [];
  await mkdir(workspace.root, {recursive: true, mode: 0o700});
  for (const directory of [workspace.statesDirectory, workspace.cacheDirectory, workspace.reportsDirectory]) {
    const existed = await exists(directory);
    await mkdir(directory, {recursive: true, mode: 0o700});
    (existed ? existing : created).push(directory);
  }
  return {created, existing};
}

export function resolveWorkspacePath(workspace: Workspace, value: string): string {
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspace.root, value);
  const relative = path.relative(workspace.root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path must remain inside workdir ${workspace.root}: ${value}`);
  }
  return candidate;
}
